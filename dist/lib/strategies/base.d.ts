/**
 * Base Strategy Class
 *
 * All strategies must extend this class and implement:
 * - computeVote(parsed, balance, state) -> { direction, team, amount, reason } | null
 *
 * Strategies can optionally override:
 * - shouldPlay(parsed, balance, state) -> boolean
 * - shouldCounterBid(parsed, balance, state, ourVote) -> vote object | null
 * - onGameStart(parsed, state) -> void
 * - onGameEnd(parsed, state, didWin) -> void
 * - onRoundEnd(parsed, state) -> void
 */
import type { Direction } from '../game-state.js';
/** Result type for computeVote and shouldCounterBid */
export type VoteResult = {
    direction: string;
    team: any;
    amount: number;
    reason: string;
} | {
    skip: true;
    reason: string;
} | null;
export declare class BaseStrategy {
    name: string;
    description: string;
    options: Record<string, any>;
    constructor(name: string, description: string, options?: Record<string, any>);
    /**
     * Compute the optimal vote for this round
     * @param parsed - Parsed game state
     * @param balance - Current ball balance
     * @param state - Daemon state (currentTeam, etc.)
     * @returns { direction, team, amount, reason } or null to skip
     */
    computeVote(parsed: any, balance: number, state: any): VoteResult;
    /**
     * Determine if we should participate this round
     * Default: play if we have enough balance
     */
    shouldPlay(parsed: any, balance: number, state: any): boolean;
    /**
     * Decide whether to counter-bid when our direction has been overridden.
     *
     * Called mid-round when the snake's currentDirection changed away from
     * what we voted for. Key mechanics:
     * - Last vote wins (not highest amount)
     * - Voting in extension window (<5s left): timer += 5s, minBid *= 2
     * - Payout is per vote count, not cumulative amount
     * - All-pay: everyone pays regardless of outcome
     *
     * @param parsed - Current parsed game state
     * @param balance - Current ball balance
     * @param state - Daemon state with roundSpend tracking
     * @param ourVote - The vote we submitted earlier this round
     * @returns Vote object to counter, or null to let it go
     */
    shouldCounterBid(parsed: any, balance: number, state: any, ourVote: any): VoteResult;
    /**
     * Called when a new game starts
     */
    onGameStart(parsed: any, state: any): void;
    /**
     * Called when a game ends
     */
    onGameEnd(parsed: any, state: any, didWin: boolean): void;
    /**
     * Called after each round
     */
    onRoundEnd(parsed: any, state: any): void;
    /**
     * Get option value with default fallback
     */
    getOption<T>(key: string, defaultValue: T): T;
    /**
     * Score a direction based on safety (exits from new position)
     * Higher score = safer
     */
    scoreDirectionSafety(dir: Direction, parsed: any): number;
    /**
     * Find the safest valid direction
     */
    findSafestDirection(parsed: any): string | null;
}
//# sourceMappingURL=base.d.ts.map