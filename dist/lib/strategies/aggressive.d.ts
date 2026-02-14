/**
 * Aggressive Strategy
 *
 * Backs the leading team, always tries to get the last word.
 * - Counters bids up to a configurable extension depth
 * - Uses minBid (amount doesn't affect payout share)
 * - Willing to enter bidding wars within budget
 */
import { BaseStrategy, VoteResult } from './base.js';
export declare class AggressiveStrategy extends BaseStrategy {
    constructor(options?: Record<string, any>);
    computeVote(parsed: any, balance: number, state: any): VoteResult;
    /**
     * Aggressive counter-bidding: will fight for direction up to N extensions.
     * Stops when cost gets too high relative to balance.
     */
    shouldCounterBid(parsed: any, balance: number, state: any, ourVote: any): VoteResult;
    findBestDirection(parsed: any, targetFruit: any): string | null;
}
//# sourceMappingURL=aggressive.d.ts.map