# snake-rodeo-agents

Standalone TypeScript library and CLI for playing the [Trifle Snake Rodeo](https://trifle.life) game.

## Features

- **Game state parsing** — hex grid utilities, BFS pathfinding, flood-fill dead-end detection
- **Strategy engine** — pluggable strategies (expected-value, aggressive, conservative, underdog, random)
- **API client** — framework-agnostic client for the trifle-bot server
- **Wallet auth** — SIWE (Sign In With Ethereum) authentication using viem
- **Standalone runner** — CLI agent that connects to a live server and plays autonomously
- **Local simulator** — offline game simulator for testing strategies against each other

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
│   │   └── strategies/           # Pluggable strategy modules
│   │       ├── base.ts           # BaseStrategy, VoteResult types
│   │       ├── expected-value.ts
│   │       ├── aggressive.ts
│   │       ├── conservative.ts
│   │       ├── underdog.ts
│   │       └── random.ts
│   └── bin/
│       └── play.ts               # Standalone CLI runner
├── dist/                         # Compiled JS + declarations
├── package.json
└── tsconfig.json
```

## License

MIT
