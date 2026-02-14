/**
 * Conservative Strategy
 *
 * Minimizes risk with small bids and safe moves.
 * - Always uses minimum bid
 * - Prioritizes safety over optimal direction
 * - Skips rounds where we're behind
 */
import { BaseStrategy, VoteResult } from './base.js';
export declare class ConservativeStrategy extends BaseStrategy {
    constructor(options?: Record<string, any>);
    shouldPlay(parsed: any, balance: number, state: any): boolean;
    computeVote(parsed: any, balance: number, state: any): VoteResult;
    findSafestDirection(parsed: any): string | null;
    findSafeDirectionToward(parsed: any, targetFruit: any): string | null;
}
//# sourceMappingURL=conservative.d.ts.map