#!/usr/bin/env node
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

import { createAndAuthenticate, reauthenticate, checkToken } from '../lib/auth.js';
import type { AuthUser } from '../lib/auth.js';
import { SnakeClient } from '../lib/client.js';
import { parseGameState, getTeamById } from '../lib/game-state.js';
import type { ParsedGameState } from '../lib/game-state.js';
import { getStrategy } from '../lib/strategies/index.js';
import type { VoteAction, AgentState } from '../lib/strategies/base.js';
import { TelegramLogger, formatVote, formatGameEnd, formatTeamSwitch, formatError } from '../lib/telegram.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(__dirname, '.state');
const CREDENTIALS_FILE = join(STATE_DIR, 'credentials.json');
const GAME_LOG_FILE = join(STATE_DIR, 'game-log.jsonl');

const SERVERS: Record<string, string> = {
  live: 'https://bot.trifle.life',
  staging: 'https://bot-staging.trifle.life',
};

interface Credentials {
  [agentName: string]: {
    token?: string;
    privateKey?: `0x${string}`;
    address?: string;
  };
}

interface RunAgentOptions {
  server?: string;
  strategy?: string;
  name?: string;
  pollMs?: number;
  maxRoundBudgetPct?: number;
  telegramToken?: string;
  telegramChatId?: string;
  contrarian?: boolean;
}

function ensureStateDir(): void {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }
}

function loadCredentials(): Credentials {
  try {
    if (existsSync(CREDENTIALS_FILE)) {
      return JSON.parse(readFileSync(CREDENTIALS_FILE, 'utf8'));
    }
  } catch {}
  return {};
}

function saveCredentials(creds: Credentials): void {
  ensureStateDir();
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
}

function logEvent(entry: Record<string, unknown>): void {
  ensureStateDir();
  const line = JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n';
  appendFileSync(GAME_LOG_FILE, line);
}

function resolveServerUrl(server: string): string {
  if (server.startsWith('http')) return server;
  return SERVERS[server] || SERVERS.live;
}

/**
 * Authenticate with the server, creating a new wallet if needed.
 */
async function ensureAuth(
  client: SnakeClient,
  backendUrl: string,
  agentName: string,
): Promise<AuthUser | null> {
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  Re-auth failed: ${msg}`);
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
 * Main game loop -- plays rounds against the live server.
 */
async function runAgent(options: RunAgentOptions = {}): Promise<void> {
  const serverUrl = resolveServerUrl(options.server || 'live');
  const strategyName = options.strategy || 'expected-value';
  const agentName = options.name || 'agent-1';
  const pollMs = options.pollMs || 1000;
  const maxRoundBudgetPct = options.maxRoundBudgetPct || 0.2;

  console.log(`=== Snake Agent: ${agentName} ===`);
  console.log(`Server: ${serverUrl}`);
  console.log(`Strategy: ${strategyName}${options.contrarian ? ' (contrarian)' : ''}`);

  const client = new SnakeClient(serverUrl, null);
  const strategyOpts: Record<string, unknown> = {};
  if (options.contrarian) strategyOpts.contrarian = true;
  const strategy = getStrategy(strategyName, strategyOpts);

  // Optional Telegram logging
  const tg = options.telegramToken && options.telegramChatId
    ? new TelegramLogger({ botToken: options.telegramToken, chatId: options.telegramChatId })
    : null;
  if (tg) console.log(`Telegram logging: enabled`);

  // Authenticate
  await ensureAuth(client, serverUrl, agentName);

  const balance = await client.getBalance();
  console.log(`Balance: ${balance} balls`);
  console.log(`Starting game loop...\n`);

  // Game loop state
  let lastRound: number = -1;
  let currentTeam: string | null = null;
  let inGame: boolean = false;
  let roundVote: VoteAction | null = null;
  let roundSpend: number = 0;
  let roundVoteCount: number = 0;
  let gamesPlayed: number = 0;
  let wins: number = 0;
  let votesPlaced: number = 0;

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
        console.log(`\nGame Over! Winner: ${winnerTeam?.emoji || parsed.winner} ${winnerTeam?.name || ''}`);
        console.log(`   ${didWin ? 'WE WON!' : 'We lost.'} (${wins}/${gamesPlayed} wins)`);
        if (winnerTeam) tg?.send(formatGameEnd(winnerTeam, didWin));

        logEvent({
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
        lastRound = parsed.round!;

        const bal = await client.getBalance();
        const state: AgentState = {
          currentTeam,
          roundSpend,
          roundVoteCount,
          lastRound,
          gamesPlayed,
          votesPlaced,
          wins,
        };

        const voteResult = strategy.computeVote(parsed, bal, state);

        if (!voteResult) {
          await sleep(pollMs);
          continue;
        }

        if ('skip' in voteResult) {
          process.stdout.write(`R${parsed.round}: skip(${voteResult.reason}) `);
          await sleep(pollMs);
          continue;
        }

        // voteResult is now narrowed to VoteAction
        if (voteResult.team.id !== currentTeam) {
          const prevTeam = currentTeam;
          currentTeam = voteResult.team.id;
          tg?.send(formatTeamSwitch(prevTeam, voteResult.team, voteResult.reason));
        }

        try {
          await client.submitVote(voteResult.direction, voteResult.team.id, voteResult.amount);
          roundVote = voteResult;
          roundSpend += voteResult.amount;
          roundVoteCount++;
          votesPlaced++;

          const newBal = bal - voteResult.amount;
          process.stdout.write(
            `R${parsed.round}: ${voteResult.direction}->${voteResult.team.emoji || voteResult.team.id} (${voteResult.reason}) bal:${newBal} `,
          );
          tg?.send(formatVote(parsed.round!, voteResult.direction, voteResult.team, voteResult.amount, newBal, parsed.teams, voteResult.reason));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!msg.includes('already active')) {
            console.log(`Vote failed: ${msg}`);
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
          const counterResult = strategy.shouldCounterBid?.(
            parsed, bal,
            {
              currentTeam,
              roundSpend,
              roundVoteCount,
              roundBudgetRemaining: budgetRemaining,
              lastRound,
              gamesPlayed,
              votesPlaced,
              wins,
            },
            roundVote,
          );

          if (counterResult && !('skip' in counterResult)) {
            try {
              await client.submitVote(counterResult.direction, counterResult.team.id, counterResult.amount);
              roundVote = counterResult;
              roundSpend += counterResult.amount;
              roundVoteCount++;
              votesPlaced++;
              process.stdout.write(`<-`);
            } catch {}
          } else {
            roundVote = null; // stop monitoring this round
          }
        }
      }

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${msg}`);
      tg?.send(formatError(msg));
    }

    const interval = roundVote ? Math.max(pollMs, 2000) : pollMs;
    await sleep(interval);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- CLI ---
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      server: { type: 'string', short: 's', default: 'live' },
      strategy: { type: 'string', default: 'expected-value' },
      name: { type: 'string', short: 'n', default: 'agent-1' },
      poll: { type: 'string', default: '1000' },
      'telegram-token': { type: 'string' },
      'telegram-chat-id': { type: 'string' },
      contrarian: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  await runAgent({
    server: values.server,
    strategy: values.strategy,
    name: values.name,
    pollMs: parseInt(values.poll!, 10),
    telegramToken: values['telegram-token'],
    telegramChatId: values['telegram-chat-id'],
    contrarian: values.contrarian,
  });
}

main().catch((e: Error) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
