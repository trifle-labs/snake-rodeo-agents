/**
 * Local Snake Game Simulator
 *
 * Replicates the trifle-bot server game logic for offline testing.
 * Multiple AI agents compete by voting on directions each round.
 * The simulator resolves votes and advances the game state.
 */
import type { HexPos, Direction, ParsedGameState } from './game-state.js';
import type { VoteResult, VoteAction, AgentState } from './strategies/base.js';
/** A function that returns a pseudo-random number in [0, 1) */
export type RNG = () => number;
/**
 * Create a seeded RNG. If no seed is provided one is auto-generated.
 */
export declare function createRNG(seed?: number): {
    rng: RNG;
    seed: number;
};
/**
 * Fisher-Yates shuffle (in-place, returns same array).
 */
export declare function shuffleArray<T>(arr: T[], rng: RNG): T[];
interface TeamConfig {
    id: string;
    name: string;
    color: string;
    emoji: string;
    [key: string]: unknown;
}
export interface RodeoCycleConfig {
    name: string;
    numberOfTeams: number;
    hexRadius: number;
    fruitsPerTeam: number;
    fruitsToWin: number;
    startingBalance: number;
    initialMinBid: number;
    initialSnakeLength: number;
    respawn: boolean;
    simpleBid: boolean;
}
export declare const RODEO_CYCLES: RodeoCycleConfig[];
/** A fruit that was eaten during a game */
interface EatenFruit extends HexPos {
    team: string | null;
    emoji: string;
    order: number;
}
/**
 * Raw game state as used by the simulator (mirrors the server shape).
 */
export interface SimGameState {
    id: number;
    snake: {
        body: HexPos[];
        currentDirection: Direction;
        currentWinningTeam: string | null;
        currentWinningUser: string | null;
    };
    gridSize: {
        type: string;
        radius: number;
    };
    apples: Record<string, HexPos[]>;
    eatenFruits: EatenFruit[];
    fruitScores: Record<string, number>;
    teamPools: Record<string, number>;
    votes: Record<string, unknown>;
    gameActive: boolean;
    winner: string | null;
    prizePool: number;
    nextMoveTime: number;
    round: number;
    countdown: number;
    totalRoundTime: number;
    minBid: number;
    nonce: number;
    config: {
        hexRadius: number;
        roundDurationSeconds: number;
        newGameDelaySeconds: number;
        extensionPeriodSeconds: number;
        fruitsPerTeam: number;
        fruitsToWin: number;
        initialMinBid: number;
        startingBalance: number;
        numberOfTeams: number;
        auctionMode: string;
        respawn: boolean;
        collision: boolean;
        simpleBid: boolean;
        initialSnakeLength: number;
        grow: boolean;
    };
    teams: TeamConfig[];
    [key: string]: unknown;
}
export interface AdvanceResult {
    gameState: SimGameState;
    event: string;
    ateFruit?: HexPos | null;
    ateTeam?: string | null;
    winner?: string | null;
}
export interface SimulateGameResult {
    gameState: SimGameState;
    winner: string | null;
    rounds: number;
    fruitScores: Record<string, number>;
    roundLog: RoundLogEntry[];
    seed: number;
}
interface RoundLogEntry {
    round: number;
    direction: Direction;
    winningTeam: string;
    event: string;
    votes: {
        agent: string;
        dir: Direction;
        team: string;
    }[];
}
export interface Strategy {
    name: string;
    description?: string;
    computeVote(parsed: ParsedGameState, balance: number, state: AgentState): VoteResult;
    shouldCounterBid?(parsed: ParsedGameState, balance: number, state: AgentState, ourVote: VoteAction): VoteResult;
}
interface ConfigResult {
    config: string;
    games: number;
    wins: Record<string, number>;
    avgRounds: number;
    noWinner: number;
}
export interface TournamentResults {
    totalGames: number;
    wins: Record<string, number>;
    avgRounds: number;
    configResults: ConfigResult[];
    agentStats?: {
        name: string;
        strategy: string;
        gamesPlayed: number;
        wins: number;
        winRate: string;
        totalSpent: number;
        totalEarned: number;
        profit: number;
        roi: string;
    }[];
    seed: number;
}
/**
 * Create initial game state for a simulation
 */
export declare function createGameState(config: RodeoCycleConfig, rng?: RNG): SimGameState;
/**
 * Move the snake in the given direction and process the game state.
 * Returns the updated game state and info about what happened.
 */
export declare function advanceRound(gameState: SimGameState, direction: Direction, winningTeamId: string | null, rng?: RNG): AdvanceResult;
/**
 * A simulated agent/player that uses a strategy to make decisions
 */
export declare class SimAgent {
    id: string;
    name: string;
    strategy: Strategy;
    balance: number;
    currentTeam: string | null;
    totalSpent: number;
    totalEarned: number;
    /** Cumulative spending across all games (persists through reset) */
    cumulativeSpent: number;
    /** Cumulative earnings across all games (persists through reset) */
    cumulativeEarned: number;
    votesPlaced: number;
    wins: number;
    gamesPlayed: number;
    fruitsCollected: number;
    constructor(id: string, name: string, strategy: Strategy, balance?: number);
    reset(balance?: number): void;
    roundSpend: number;
    roundVoteCount: number;
    /** Max fraction of balance to spend in a single round */
    maxRoundBudgetPct: number;
    computeVote(gameState: SimGameState): VoteAction | null;
    /**
     * Attempt a counter-bid after being overridden.
     * Returns a VoteAction if the agent wants to counter, null otherwise.
     */
    computeCounterBid(gameState: SimGameState, previousVote: VoteAction): VoteAction | null;
    /** Reset per-round counters (called at start of each round) */
    resetRound(): void;
}
export interface SimulateOptions {
    maxRounds?: number;
    verbose?: boolean;
    seed?: number;
    /** Max counter-bid extensions per round (default: 5). Each extension doubles minBid. */
    maxExtensions?: number;
}
/**
 * Run a single simulated game with multiple agents.
 *
 * Each round:
 * 1. Reset per-round budgets, shuffle agent order
 * 2. All agents compute initial votes
 * 3. "Last vote wins" — reveal the winning direction
 * 4. Counter-bidding loop: agents whose direction was overridden can
 *    counter-bid. Each counter-bid doubles minBid (extension mechanic).
 *    Loop until no one counters or max extensions reached.
 * 5. Snake moves in the final winning direction
 * 6. Repeat until a team wins or max rounds reached
 */
export declare function simulateGame(agents: SimAgent[], config: RodeoCycleConfig, options?: SimulateOptions): SimulateGameResult;
/**
 * Run multiple games and collect statistics
 */
export declare function runTournament(agents: SimAgent[], configs: RodeoCycleConfig[], numGamesPerConfig?: number, options?: SimulateOptions): TournamentResults;
/**
 * Pretty-print game state for debugging
 */
export declare function printBoard(gameState: SimGameState): void;
export {};
//# sourceMappingURL=simulator.d.ts.map