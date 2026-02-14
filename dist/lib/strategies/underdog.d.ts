/**
 * Underdog Strategy
 *
 * Backs teams with small pools for bigger payout potential.
 * - Focuses on payout multiplier over win probability
 * - Prefers teams that are behind but have a path to victory
 * - Good for building ball balance over time
 */
import { BaseStrategy } from './base.js';
import type { VoteResult, AgentState } from './base.js';
import type { Direction, HexPos, ParsedGameState } from '../game-state.js';
export declare class UnderdogStrategy extends BaseStrategy {
    constructor(options?: Record<string, unknown>);
    computeVote(parsed: ParsedGameState, balance: number, state: AgentState): VoteResult;
    findBestDirection(parsed: ParsedGameState, targetFruit: HexPos | null): Direction | null;
}
//# sourceMappingURL=underdog.d.ts.map