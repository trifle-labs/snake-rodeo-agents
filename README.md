# snake-rodeo-agents

Standalone TypeScript library and CLI for playing the [Trifle Snake Rodeo](https://snake.rodeo) game.

## Features

- **Game state parsing** — hex grid utilities, BFS pathfinding, flood-fill dead-end detection
- **Strategy engine** — pluggable strategies (expected-value, aggressive, conservative, underdog, random)
- **API client** — framework-agnostic client for the trifle-bot server
- **Wallet auth** — SIWE (Sign In With Ethereum) authentication using viem
- **Standalone runner** — CLI agent that connects to a live server and plays autonomously
- **Local simulator** — offline game simulator for testing strategies against each other
- **Tournament CLI** — high-speed seeded tournament runner for comparing strategies

## Installation

```bash
npm install github:trifle-labs/snake-rodeo-agents
```

## Quick Start (CLI)

```bash
# Play on the live server
npx snake-rodeo-agents --server live --strategy expected-value

# Play on staging
npx snake-rodeo-agents --server staging --name my-agent
```

The CLI automatically creates a wallet, authenticates, and starts playing. Credentials are persisted in `dist/bin/.state/` for reuse across sessions.

## Library Usage

```javascript
import {
  SnakeClient,
  createAndAuthenticate,
  parseGameState,
  getStrategy,
} from 'snake-rodeo-agents';

// Authenticate with a generated wallet
const { token, privateKey, address } = await createAndAuthenticate('https://bot.trifle.life');
// Save privateKey to reuse this wallet later (see Wallet Auth below)

// Create API client
const client = new SnakeClient('https://bot.trifle.life', token);

// Get game state and compute a vote
const rawState = await client.getGameState();
const parsed = parseGameState(rawState);
const strategy = getStrategy('expected-value');
const vote = strategy.computeVote(parsed, balance, {
  currentTeam: null,
  roundSpend: 0,
  roundVoteCount: 0,
  lastRound: -1,
  gamesPlayed: 0,
  votesPlaced: 0,
  wins: 0,
});
```

## Wallet Auth

Authentication uses SIWE (Sign In With Ethereum). The library generates throwaway wallets — no real ETH needed.

### Create a new wallet

```javascript
import { createAndAuthenticate } from 'snake-rodeo-agents';

const { token, privateKey, address } = await createAndAuthenticate('https://bot.trifle.life');
// token: JWT for API calls
// privateKey: 0x-prefixed hex string — save this to reuse the wallet
// address: the wallet's Ethereum address
```

### Reuse a saved wallet

```javascript
import { reauthenticate } from 'snake-rodeo-agents';

const savedKey = '0xabc123...'; // previously saved privateKey
const { token, address } = await reauthenticate('https://bot.trifle.life', savedKey);
```

### Use an existing viem account

```javascript
import { authenticateWallet } from 'snake-rodeo-agents';
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount('0xabc123...');
const token = await authenticateWallet('https://bot.trifle.life', account, {
  chainId: 1,        // default: 1 (mainnet)
  domain: 'trifle.life',
  uri: 'https://trifle.life',
});
```

### Check if a token is still valid

```javascript
import { checkToken } from 'snake-rodeo-agents';

const user = await checkToken('https://bot.trifle.life', token);
if (user) {
  console.log(`Authenticated as ${user.username} (id: ${user.id})`);
} else {
  console.log('Token expired, re-authenticate');
}
```

## Telegram Logging

Optionally send game events (votes, wins, team switches, errors) to a Telegram group.

### CLI

```bash
npx snake-rodeo-agents --server live \
  --telegram-token "$TELEGRAM_BOT_TOKEN" \
  --telegram-chat-id "$TELEGRAM_CHAT_ID"
```

Both `--telegram-token` and `--telegram-chat-id` must be provided; if either is missing, Telegram logging is silently skipped.

### Library

```javascript
import { TelegramLogger, formatVote, formatGameEnd } from 'snake-rodeo-agents';

const tg = new TelegramLogger({
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  chatId: process.env.TELEGRAM_CHAT_ID,
});

// Send an arbitrary HTML message
await tg.send('<b>Hello</b> from the snake agent!');

// Use built-in formatters
await tg.send(formatGameEnd(winnerTeam, true));
```

## Tournament Simulator

Run offline tournaments to compare strategies at high speed with reproducible results.

### CLI

```bash
# Compare expected-value vs aggressive (100 games per config, all configs)
npm run simulate -- ev,aggressive

# Specific config, seeded for reproducibility
npm run simulate -- ev,aggressive --games 50 --config small --seed 42

# Multiple strategies with options
npm run simulate -- ev,ev:contrarian,random --games 200

# Machine-readable JSON output
npm run simulate -- ev,aggressive --json
```

### Options

| Flag | Description |
|------|-------------|
| `-g, --games N` | Games per config (default: 100) |
| `-c, --config NAME` | `small\|medium\|large\|all` (default: all) |
| `-s, --seed N` | RNG seed for reproducibility |
| `-v, --verbose` | Print per-round details |
| `--json` | Machine-readable JSON output |
| `-h, --help` | Show help and available strategies |

Agent specs use the format `strategy[:option[:option]]` — e.g. `ev`, `ev:contrarian`, `aggressive`.

### Library

```javascript
import { SimAgent, runTournament, RODEO_CYCLES, getStrategy, createRNG } from 'snake-rodeo-agents';

const agents = [
  new SimAgent('a', 'ev-agent', getStrategy('ev')),
  new SimAgent('b', 'agg-agent', getStrategy('aggressive')),
];

const results = runTournament(agents, RODEO_CYCLES, 100, { seed: 42 });
console.log(results.agentStats);
// Re-run with same seed for identical results
```

## Strategies

| Strategy | Description |
|----------|-------------|
| `expected-value` | Maximizes expected value. BFS pathfinding, dead-end avoidance, game-theoretic team selection. |
| `aggressive` | Backs leading teams, counter-bids aggressively. |
| `underdog` | Backs small pools for bigger payouts. |
| `conservative` | Minimum bids, prioritizes safety. |
| `random` | Random valid moves. |

## Architecture

```
snake-rodeo-agents/
├── src/                          # TypeScript source
│   ├── index.ts                  # Public API exports
│   ├── lib/
│   │   ├── game-state.ts         # Hex grid, BFS, flood-fill, state parsing
│   │   ├── client.ts             # API client (SnakeClient)
│   │   ├── auth.ts               # Wallet SIWE authentication
│   │   ├── simulator.ts          # Local game simulator for testing
│   │   ├── telegram.ts           # Optional Telegram logging
│   │   └── strategies/           # Pluggable strategy modules
│   │       ├── base.ts           # BaseStrategy, VoteResult types
│   │       ├── expected-value.ts
│   │       ├── aggressive.ts
│   │       ├── conservative.ts
│   │       ├── underdog.ts
│   │       └── random.ts
│   └── bin/
│       ├── play.ts               # Standalone CLI runner
│       └── simulate.ts           # Tournament simulator CLI
├── dist/                         # Compiled JS + declarations
├── package.json
└── tsconfig.json
```

## License

MIT
