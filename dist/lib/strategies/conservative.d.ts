/**
 * Conservative Strategy
 *
 * Minimizes risk with small bids and safe moves.
 * - Always uses minimum bid
 * - Prioritizes safety over optimal direction
 * - Skips rounds where we're behind
 */
import { BaseStrategy } from './base.js';
import type { VoteResult, AgentState } from './base.js';
import type { Direction, HexPos, ParsedGameState } from '../game-state.js';
export declare class ConservativeStrategy extends BaseStrategy {
    constructor(options?: Record<string, unknown>);
    shouldPlay(parsed: ParsedGameState, balance: number, state: AgentState): boolean;
    computeVote(parsed: ParsedGameState, balance: number, state: AgentState): VoteResult;
    findSafeDirectionToward(parsed: ParsedGameState, targetFruit: HexPos | null): Direction | null;
}
//# sourceMappingURL=conservative.d.ts.map