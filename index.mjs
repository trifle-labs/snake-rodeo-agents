/**
 * snake-rodeo-agents — Standalone library for playing the Trifle Snake Rodeo game
 *
 * Exports game state utilities, strategies, API client, and wallet auth.
 */

// Game state utilities
export {
  HEX_DIRECTIONS,
  OPPOSITE_DIRECTIONS,
  ALL_DIRECTIONS,
  isInBounds,
  isOnSnakeBody,
  hexDistance,
  getValidDirections,
  findClosestFruit,
  bestDirectionToward,
  countExits,
  ROUND_TIMING,
  parseGameState,
  getTeamById,
  bfsDistance,
  floodFillSize,
} from './lib/game-state.mjs';

// Strategies
export {
  getStrategy,
  listStrategiesWithInfo,
  BaseStrategy,
} from './lib/strategies/index.mjs';

// API client
export { SnakeClient } from './lib/client.mjs';

// Wallet auth
export {
  createAndAuthenticate,
  reauthenticate,
  authenticateWallet,
  checkToken,
} from './lib/auth.mjs';
