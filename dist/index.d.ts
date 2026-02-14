/**
 * snake-rodeo-agents -- Standalone library for playing the Trifle Snake Rodeo game
 *
 * Exports game state utilities, strategies, API client, and wallet auth.
 */
export { HEX_DIRECTIONS, OPPOSITE_DIRECTIONS, ALL_DIRECTIONS, isInBounds, isOnSnakeBody, hexDistance, getValidDirections, findClosestFruit, bestDirectionToward, countExits, ROUND_TIMING, parseGameState, getTeamById, bfsDistance, floodFillSize, } from './lib/game-state.js';
export type { HexPos, Direction, ParsedGameState, } from './lib/game-state.js';
export { getStrategy, listStrategiesWithInfo, BaseStrategy, } from './lib/strategies/index.js';
export { SnakeClient } from './lib/client.js';
export type { ApiError } from './lib/client.js';
export { createAndAuthenticate, reauthenticate, authenticateWallet, checkToken, } from './lib/auth.js';
export type { AuthResult, AuthOptions, AuthUser, } from './lib/auth.js';
//# sourceMappingURL=index.d.ts.map