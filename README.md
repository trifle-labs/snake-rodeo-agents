# snake-rodeo-agents

Standalone library and CLI for playing the [Trifle Snake Rodeo](https://trifle.life) game.

## Features

- **Game state parsing** — hex grid utilities, BFS pathfinding, flood-fill dead-end detection
- **Strategy engine** — pluggable strategies (expected-value, aggressive, conservative, underdog, random)
- **API client** — framework-agnostic client for the trifle-bot server
- **Wallet auth** — SIWE (Sign In With Ethereum) authentication using viem
- **Standalone runner** — CLI agent that connects to a live server and plays autonomously

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

## Library Usage

```javascript
import {
  SnakeClient,
  createAndAuthenticate,
  parseGameState,
  getStrategy,
} from 'snake-rodeo-agents';

// Authenticate with a generated wallet
const { token } = await createAndAuthenticate('https://bot.trifle.life');

// Create API client
const client = new SnakeClient('https://bot.trifle.life', token);

// Get game state and compute a vote
const rawState = await client.getGameState();
const parsed = parseGameState(rawState);
const strategy = getStrategy('expected-value');
const vote = strategy.computeVote(parsed, balance, state);
```

## Strategies

| Strategy | Description |
|----------|-------------|
| `expected-value` | Maximizes expected value. BFS pathfinding, dead-end avoidance, game-theoretic team selection. |
| `aggressive` | High bids on leading teams. |
| `underdog` | Backs small pools for bigger payouts. |
| `conservative` | Minimum bids, prioritizes safety. |
| `random` | Random valid moves. |

## Architecture

```
snake-rodeo-agents/
├── index.mjs             # Public API exports
├── lib/
│   ├── game-state.mjs    # Hex grid, BFS, flood-fill, state parsing
│   ├── client.mjs        # API client (SnakeClient)
│   ├── auth.mjs          # Wallet SIWE authentication
│   ├── simulator.mjs     # Local game simulator for testing
│   └── strategies/       # Pluggable strategy modules
└── bin/
    └── play.mjs          # Standalone CLI runner
```

## License

MIT
