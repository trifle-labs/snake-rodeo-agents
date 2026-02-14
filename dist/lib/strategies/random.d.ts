/**
 * Random Strategy
 *
 * Makes random valid moves. Useful for testing or when you just want chaos.
 */
import { BaseStrategy } from './base.js';
import type { VoteResult, AgentState } from './base.js';
import type { ParsedGameState } from '../game-state.js';
export declare class RandomStrategy extends BaseStrategy {
    constructor(options?: Record<string, unknown>);
    computeVote(parsed: ParsedGameState, balance: number, state: AgentState): VoteResult;
}
//# sourceMappingURL=random.d.ts.map