/**
 * Underdog Strategy
 *
 * Backs teams with small pools for bigger payout potential.
 * - Focuses on payout multiplier over win probability
 * - Prefers teams that are behind but have a path to victory
 * - Good for building ball balance over time
 */
import { BaseStrategy, VoteResult } from './base.js';
export declare class UnderdogStrategy extends BaseStrategy {
    constructor(options?: Record<string, any>);
    computeVote(parsed: any, balance: number, state: any): VoteResult;
    findBestDirection(parsed: any, targetFruit: any): string | null;
}
//# sourceMappingURL=underdog.d.ts.map