/**
 * Game state utilities and hex grid helpers
 */
export interface HexPos {
    q: number;
    r: number;
}
export type Direction = 'n' | 'ne' | 'se' | 's' | 'sw' | 'nw';
export interface GridSize {
    radius: number;
}
export interface Snake {
    body: HexPos[];
    currentDirection?: Direction;
    currentWinningTeam?: string | null;
}
export interface Team {
    id: string;
    name?: string;
    color?: string;
    emoji?: string;
    [key: string]: unknown;
}
export interface ParsedTeam extends Team {
    score: number;
    pool: number;
    closestFruit: ClosestFruitResult | null;
}
export interface ClosestFruitResult {
    fruit: HexPos;
    distance: number;
}
export interface BfsResult {
    distance: number;
    firstDir: Direction | null;
}
export interface GameState {
    snake?: Snake;
    gridSize?: GridSize;
    gameActive?: boolean;
    round?: number;
    prizePool?: number;
    minBid?: number;
    countdown?: number;
    config?: {
        initialMinBid?: number;
        fruitsToWin?: number;
        [key: string]: unknown;
    };
    teams?: Team[];
    fruitScores?: Record<string, number>;
    teamPools?: Record<string, number>;
    apples?: Record<string, HexPos[]>;
    votes?: Record<string, unknown>;
    winner?: string | null;
    error?: string;
    [key: string]: unknown;
}
export interface ParsedGameState {
    active: boolean | undefined;
    round: number | undefined;
    prizePool: number;
    minBid: number;
    initialMinBid: number;
    countdown: number;
    inExtensionWindow: boolean;
    extensions: number;
    fruitsToWin: number;
    gridRadius: number;
    head: HexPos;
    snakeLength: number;
    currentDirection: Direction | undefined;
    currentWinningTeam: string | undefined;
    teams: ParsedTeam[];
    validDirections: Direction[];
    votes: Record<string, unknown>;
    winner: string | undefined;
    raw: GameState;
}
export declare const HEX_DIRECTIONS: Record<Direction, HexPos>;
export declare const OPPOSITE_DIRECTIONS: Record<Direction, Direction>;
export declare const ALL_DIRECTIONS: Direction[];
/**
 * Check if coordinates are within hex grid bounds
 */
export declare function isInBounds(q: number, r: number, radius: number): boolean;
/**
 * Check if a position is on the snake body
 */
export declare function isOnSnakeBody(q: number, r: number, snakeBody: HexPos[]): boolean;
/**
 * Calculate hex distance between two points in axial coordinates
 * Uses cube coordinate conversion: for axial (q, r), cube is (q, r, -q-r)
 * Distance = max(|dq|, |dr|, |dq + dr|) where dq = q1 - q2, dr = r1 - r2
 */
export declare function hexDistance(a: HexPos, b: HexPos): number;
/**
 * Get all valid directions the snake can move
 */
export declare function getValidDirections(gameState: GameState): Direction[];
/**
 * Find the closest fruit for a team
 */
export declare function findClosestFruit(head: HexPos, fruits: Record<string, HexPos[]>, teamId: string): ClosestFruitResult | null;
/**
 * Get the best direction toward a target
 */
export declare function bestDirectionToward(head: HexPos, target: HexPos, validDirs: Direction[]): Direction | null;
/**
 * Count exits from a position (safety metric)
 */
export declare function countExits(pos: HexPos, gameState: GameState, excludeDir?: Direction | null): number;
/**
 * Round timing constants (must match server config)
 */
export declare const ROUND_TIMING: {
    readonly baseDurationSec: 10;
    readonly extensionPeriodSec: 5;
};
/**
 * Parse game state into a more usable format
 */
export declare function parseGameState(gs: any): ParsedGameState | null;
/**
 * Get team by ID
 */
export declare function getTeamById(parsed: ParsedGameState, teamId: string): ParsedTeam | undefined;
/**
 * BFS shortest path from a position to a target, respecting snake body and grid bounds.
 * Returns the path length (number of moves) or Infinity if unreachable.
 * Also returns the first direction to take.
 *
 * When timeAware is true, accounts for the snake's tail moving: body segment
 * body[i] will clear after (body.length - i) moves, so BFS allows passing
 * through a body cell if the BFS distance to that cell >= its clear time.
 * This finds shorter paths through the snake's own trailing body.
 */
export declare function bfsDistance(from: HexPos, to: HexPos, gameState: GameState, excludeHead?: boolean, timeAware?: boolean): BfsResult;
/**
 * Flood-fill reachable area from a position.
 * Returns the count of reachable cells (a proxy for how "trapped" you are).
 */
export declare function floodFillSize(pos: HexPos, gameState: GameState, excludeDir?: Direction | null): number;
//# sourceMappingURL=game-state.d.ts.map