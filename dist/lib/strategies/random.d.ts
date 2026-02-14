/**
 * Random Strategy
 *
 * Makes random valid moves. Useful for testing or when you just want chaos.
 */
import { BaseStrategy, VoteResult } from './base.js';
export declare class RandomStrategy extends BaseStrategy {
    constructor(options?: Record<string, any>);
    computeVote(parsed: any, balance: number, state: any): VoteResult;
}
//# sourceMappingURL=random.d.ts.map