/**
 * Base Strategy Class
 *
 * All strategies must extend this class and implement:
 * - computeVote(parsed, balance, state) -> VoteAction | VoteSkip | null
 *
 * Strategies can optionally override:
 * - shouldPlay(parsed, balance, state) -> boolean
 * - shouldCounterBid(parsed, balance, state, ourVote) -> VoteAction | VoteSkip | null
 * - onGameStart(parsed, state) -> void
 * - onGameEnd(parsed, state, didWin) -> void
 * - onRoundEnd(parsed, state) -> void
 */
import type { Direction, ParsedGameState, ParsedTeam } from '../game-state.js';
/** Agent state passed to strategies each round */
export interface AgentState {
    currentTeam: string | null;
    roundSpend: number;
    roundVoteCount: number;
    lastRound: number;
    gamesPlayed: number;
    votesPlaced: number;
    wins: number;
    roundBudgetRemaining?: number;
}
/** A concrete vote: direction + team + amount */
export interface VoteAction {
    direction: Direction;
    team: ParsedTeam;
    amount: number;
    reason: string;
}
/** Explicit skip with reason */
export interface VoteSkip {
    skip: true;
    reason: string;
}
/** Result type for computeVote and shouldCounterBid */
export type VoteResult = VoteAction | VoteSkip | null;
export declare class BaseStrategy {
    name: string;
    description: string;
    options: Record<string, unknown>;
    constructor(name: string, description: string, options?: Record<string, unknown>);
    /**
     * Compute the optimal vote for this round
     */
    computeVote(parsed: ParsedGameState, balance: number, state: AgentState): VoteResult;
    /**
     * Determine if we should participate this round
     * Default: play if we have enough balance
     */
    shouldPlay(parsed: ParsedGameState, balance: number, state: AgentState): boolean;
    /**
     * Decide whether to counter-bid when our direction has been overridden.
     *
     * Called mid-round when the snake's currentDirection changed away from
     * what we voted for. Key mechanics:
     * - Last vote wins (not highest amount)
     * - Voting in extension window (<5s left): timer += 5s, minBid *= 2
     * - Payout is per vote count, not cumulative amount
     * - All-pay: everyone pays regardless of outcome
     */
    shouldCounterBid(parsed: ParsedGameState, balance: number, state: AgentState, ourVote: VoteAction): VoteResult;
    /**
     * Called when a new game starts
     */
    onGameStart(parsed: ParsedGameState, state: AgentState): void;
    /**
     * Called when a game ends
     */
    onGameEnd(parsed: ParsedGameState, state: AgentState, didWin: boolean): void;
    /**
     * Called after each round
     */
    onRoundEnd(parsed: ParsedGameState, state: AgentState): void;
    /**
     * Get option value with default fallback
     */
    getOption<T>(key: string, defaultValue: T): T;
    /**
     * Score a direction based on safety (exits from new position)
     * Higher score = safer
     */
    scoreDirectionSafety(dir: Direction, parsed: ParsedGameState): number;
    /**
     * Find the safest valid direction
     */
    findSafestDirection(parsed: ParsedGameState): Direction | null;
}
//# sourceMappingURL=base.d.ts.map