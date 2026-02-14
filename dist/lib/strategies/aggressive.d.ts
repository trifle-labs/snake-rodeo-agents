/**
 * Aggressive Strategy
 *
 * Backs the leading team, always tries to get the last word.
 * - Counters bids up to a configurable extension depth
 * - Uses minBid (amount doesn't affect payout share)
 * - Willing to enter bidding wars within budget
 */
import { BaseStrategy } from './base.js';
import type { VoteResult, AgentState, VoteAction } from './base.js';
import type { Direction, HexPos, ParsedGameState } from '../game-state.js';
export declare class AggressiveStrategy extends BaseStrategy {
    constructor(options?: Record<string, unknown>);
    computeVote(parsed: ParsedGameState, balance: number, state: AgentState): VoteResult;
    /**
     * Aggressive counter-bidding: will fight for direction up to N extensions.
     * Stops when cost gets too high relative to balance.
     */
    shouldCounterBid(parsed: ParsedGameState, balance: number, state: AgentState, ourVote: VoteAction): VoteResult;
    findBestDirection(parsed: ParsedGameState, targetFruit: HexPos | null): Direction | null;
}
//# sourceMappingURL=aggressive.d.ts.map