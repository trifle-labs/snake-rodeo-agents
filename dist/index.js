/**
 * snake-rodeo-agents -- Standalone library for playing the Trifle Snake Rodeo game
 *
 * Exports game state utilities, strategies, API client, and wallet auth.
 */
// Game state utilities
export { HEX_DIRECTIONS, OPPOSITE_DIRECTIONS, ALL_DIRECTIONS, CARTESIAN_DIRECTIONS, CARTESIAN_OPPOSITES, ALL_CARTESIAN_DIRECTIONS, ALL_DIRECTION_OFFSETS, ALL_OPPOSITES, getDirectionsForGrid, detectGridType, isInBounds, isOnSnakeBody, hexDistance, manhattanDistance, gridDistance, getTotalCells, getValidDirections, findClosestFruit, bestDirectionToward, countExits, ROUND_TIMING, parseGameState, getTeamById, bfsDistance, floodFillSize, } from './lib/game-state.js';
// Strategies
export { getStrategy, listStrategiesWithInfo, BaseStrategy, } from './lib/strategies/index.js';
// API client
export { SnakeClient } from './lib/client.js';
// Wallet auth
export { createAndAuthenticate, reauthenticate, authenticateWallet, checkToken, } from './lib/auth.js';
// Simulator
export { SimAgent, simulateGame, runTournament, createGameState, advanceRound, printBoard, RODEO_CYCLES, createRNG, shuffleArray, } from './lib/simulator.js';
// Telegram logging (optional)
export { TelegramLogger, formatVote, formatGameEnd, formatTeamSwitch, formatError, formatWarning } from './lib/telegram.js';
//# sourceMappingURL=index.js.map