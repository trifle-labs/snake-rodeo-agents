/**
 * snake-rodeo-agents -- Standalone library for playing the Trifle Snake Rodeo game
 *
 * Exports game state utilities, strategies, API client, and wallet auth.
 */
// Game state utilities
export { HEX_DIRECTIONS, OPPOSITE_DIRECTIONS, ALL_DIRECTIONS, isInBounds, isOnSnakeBody, hexDistance, getValidDirections, findClosestFruit, bestDirectionToward, countExits, ROUND_TIMING, parseGameState, getTeamById, bfsDistance, floodFillSize, } from './lib/game-state.js';
// Strategies
export { getStrategy, listStrategiesWithInfo, BaseStrategy, } from './lib/strategies/index.js';
// API client
export { SnakeClient } from './lib/client.js';
// Wallet auth
export { createAndAuthenticate, reauthenticate, authenticateWallet, checkToken, } from './lib/auth.js';
// Telegram logging (optional)
export { TelegramLogger, formatVote, formatGameEnd, formatTeamSwitch, formatError, formatWarning } from './lib/telegram.js';
//# sourceMappingURL=index.js.map