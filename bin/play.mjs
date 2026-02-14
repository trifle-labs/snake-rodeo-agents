/**
 * Standalone Snake Agent Runner
 *
 * Connects to a live trifle-bot server, authenticates with a generated
 * wallet, and plays the snake game using a strategy. Logs game events
 * and results for analysis.
 *
 * Usage:
 *   node bin/play.mjs [--server live|staging|URL] [--strategy NAME]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';

import { createAndAuthenticate, reauthenticate, checkToken } from '../lib/auth.mjs';
import { SnakeClient } from '../lib/client.mjs';
import { parseGameState, getTeamById } from '../lib/game-state.mjs';
import { getStrategy } from '../lib/strategies/index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(__dirname, '.state');
const CREDENTIALS_FILE = join(STATE_DIR, 'credentials.json');
const GAME_LOG_FILE = join(STATE_DIR, 'game-log.jsonl');

const SERVERS = {
  live: 'https://bot.trifle.life',
  staging: 'https://bot-staging.trifle.life',
};

function ensureStateDir() {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }
}

function loadCredentials() {
  try {
    if (existsSync(CREDENTIALS_FILE)) {
      return JSON.parse(readFileSync(CREDENTIALS_FILE, 'utf8'));
    }
  } catch {}
  return {};
}

function saveCredentials(creds) {
  ensureStateDir();
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
}

function logEvent(entry) {
  ensureStateDir();
  const line = JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n';
  appendFileSync(GAME_LOG_FILE, line);
}

function resolveServerUrl(server) {
  if (server.startsWith('http')) return server;
  return SERVERS[server] || SERVERS.live;
}

/**
 * Authenticate with the server, creating a new wallet if needed.
 */
async function ensureAuth(client, backendUrl, agentName) {
  const creds = loadCredentials();
  const agentCreds = creds[agentName];

  // Try existing token
  if (agentCreds?.token) {
    client.setToken(agentCreds.token);
    const user = await checkToken(backendUrl, agentCreds.token);
    if (user) {
      console.log(`  Authenticated as ${user.username} (id:${user.id})`);
      return user;
    }
    console.log(`  Token expired, re-authenticating...`);
  }

  // Try re-auth with saved private key
  if (agentCreds?.privateKey) {
    try {
      const result = await reauthenticate(backendUrl, agentCreds.privateKey);
      creds[agentName] = { ...agentCreds, token: result.token };
      saveCredentials(creds);
      client.setToken(result.token);
      const user = await checkToken(backendUrl, result.token);
      console.log(`  Re-authenticated as ${user?.username || result.address} (id:${user?.id})`);
      return user;
    } catch (e) {
      console.log(`  Re-auth failed: ${e.message}`);
    }
  }

  // Create new wallet
  console.log(`  Creating new wallet for ${agentName}...`);
  const result = await createAndAuthenticate(backendUrl);
  creds[agentName] = {
    token: result.token,
    privateKey: result.privateKey,
    address: result.address,
  };
  saveCredentials(creds);
  client.setToken(result.token);

  const user = await checkToken(backendUrl, result.token);
  console.log(`  New account: ${user?.username || result.address} (id:${user?.id})`);
  return user;
}

/**
 * Main game loop — plays rounds against the live server.
 */
async function runAgent(options = {}) {
  const serverUrl = resolveServerUrl(options.server || 'live');
  const strategyName = options.strategy || 'expected-value';
  const agentName = options.name || 'agent-1';
  const pollMs = options.pollMs || 1000;
  const maxRoundBudgetPct = options.maxRoundBudgetPct || 0.2;

  console.log(`=== Snake Agent: ${agentName} ===`);
  console.log(`Server: ${serverUrl}`);
  console.log(`Strategy: ${strategyName}`);

  const client = new SnakeClient(serverUrl, null);
  const strategy = getStrategy(strategyName);

  // Authenticate
  await ensureAuth(client, serverUrl, agentName);

  const balance = await client.getBalance();
  console.log(`Balance: ${balance} balls`);
  console.log(`Starting game loop...\n`);

  // Game loop state
  let lastRound = -1;
  let currentTeam = null;
  let inGame = false;
  let roundVote = null;
  let roundSpend = 0;
  let roundVoteCount = 0;
  let gamesPlayed = 0;
  let wins = 0;
  let votesPlaced = 0;

  while (true) {
    try {
      const rawState = await client.getGameState();
      if (rawState.error) {
        if (rawState.error === 'AUTH_MISSING' || rawState.error === 'AUTH_EXPIRED') {
          console.log('Auth expired, re-authenticating...');
          await ensureAuth(client, serverUrl, agentName);
        }
        await sleep(pollMs);
        continue;
      }

      const parsed = parseGameState(rawState);

      if (!parsed) {
        if (inGame) {
          console.log('Game ended (no state)');
          inGame = false;
        }
        await sleep(pollMs);
        continue;
      }

      // Game just started
      if (!inGame && parsed.active) {
        inGame = true;
        currentTeam = null;
        lastRound = -1;
        roundVote = null;
        roundSpend = 0;
        roundVoteCount = 0;
        console.log(`\n--- New Game Started ---`);
      }

      // Game ended
      if (!parsed.active && parsed.winner && inGame) {
        const didWin = currentTeam === parsed.winner;
        gamesPlayed++;
        if (didWin) wins++;
        inGame = false;

        const winnerTeam = getTeamById(parsed, parsed.winner);
        console.log(`\n🏁 Game Over! Winner: ${winnerTeam?.emoji || parsed.winner} ${winnerTeam?.name || ''}`);
        console.log(`   ${didWin ? '✅ WE WON!' : '❌ We lost.'} (${wins}/${gamesPlayed} wins)`);

        await logEvent({
          event: 'game_end',
          agent: agentName,
          strategy: strategyName,
          winner: parsed.winner,
          didWin,
          gamesPlayed,
          wins,
          ourTeam: currentTeam,
          fruitScores: parsed.raw?.fruitScores,
          rounds: parsed.round,
        });

        currentTeam = null;
        lastRound = -1;
        roundVote = null;
        roundSpend = 0;
        roundVoteCount = 0;
        await sleep(pollMs);
        continue;
      }

      if (!parsed.active) {
        await sleep(pollMs);
        continue;
      }

      // --- New round ---
      if (parsed.round !== lastRound) {
        roundVote = null;
        roundSpend = 0;
        roundVoteCount = 0;
        lastRound = parsed.round;

        const bal = await client.getBalance();
        const state = {
          currentTeam,
          roundSpend,
          roundVoteCount,
          lastRound,
          gamesPlayed,
          votesPlaced,
          wins,
        };

        const vote = strategy.computeVote(parsed, bal, state);

        if (!vote || vote.skip) {
          if (vote?.reason) {
            process.stdout.write(`R${parsed.round}: skip(${vote.reason}) `);
          }
          await sleep(pollMs);
          continue;
        }

        if (vote.team.id !== currentTeam) {
          currentTeam = vote.team.id;
        }

        try {
          await client.submitVote(vote.direction, vote.team.id, vote.amount);
          roundVote = vote;
          roundSpend += vote.amount;
          roundVoteCount++;
          votesPlaced++;

          const newBal = bal - vote.amount;
          process.stdout.write(
            `R${parsed.round}: ${vote.direction}→${vote.team.emoji || vote.team.id} (${vote.reason}) bal:${newBal} `
          );
        } catch (e) {
          if (!e.message?.includes('already active')) {
            console.log(`Vote failed: ${e.message}`);
          }
        }

        await sleep(pollMs);
        continue;
      }

      // --- Mid-round monitoring ---
      if (roundVote && parsed.currentDirection !== roundVote.direction) {
        const bal = await client.getBalance();
        const maxBudget = bal * maxRoundBudgetPct;
        const budgetRemaining = maxBudget - roundSpend;

        if (bal >= parsed.minBid && budgetRemaining >= parsed.minBid) {
          const counter = strategy.shouldCounterBid(
            parsed, bal,
            {
              currentTeam,
              roundSpend,
              roundVoteCount,
              roundBudgetRemaining: budgetRemaining,
              gamesPlayed,
              votesPlaced,
              wins,
            },
            roundVote
          );

          if (counter) {
            try {
              await client.submitVote(counter.direction, counter.team.id, counter.amount);
              roundVote = counter;
              roundSpend += counter.amount;
              roundVoteCount++;
              votesPlaced++;
              process.stdout.write(`↩️`);
            } catch {}
          } else {
            roundVote = null; // stop monitoring this round
          }
        }
      }

    } catch (e) {
      console.error(`Error: ${e.message}`);
    }

    const interval = roundVote ? Math.max(pollMs, 2000) : pollMs;
    await sleep(interval);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- CLI ---
async function main() {
  const { values } = parseArgs({
    options: {
      server: { type: 'string', short: 's', default: 'live' },
      strategy: { type: 'string', default: 'expected-value' },
      name: { type: 'string', short: 'n', default: 'agent-1' },
      poll: { type: 'string', default: '1000' },
    },
    allowPositionals: true,
  });

  await runAgent({
    server: values.server,
    strategy: values.strategy,
    name: values.name,
    pollMs: parseInt(values.poll),
  });
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
