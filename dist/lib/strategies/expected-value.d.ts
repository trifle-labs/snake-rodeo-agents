/**
 * Expected Value Strategy -- v2
 *
 * Maximizes expected value: P(win) * payout per vote
 *
 * Key improvements over v1:
 * - BFS pathfinding instead of raw hex distance (respects snake body)
 * - Flood-fill dead-end detection (avoid getting trapped)
 * - Multi-fruit awareness (all teams' fruits, avoid wrong-team fruit)
 * - Better team selection using actual path distances
 *
 * Game mechanics:
 * - Last vote wins direction (not highest amount)
 * - Payout is per vote count, not cumulative amount
 * - Voting in extension window: round extends 5s, minBid doubles
 * - All-pay auction: everyone pays regardless of outcome
 */
import { BaseStrategy, VoteResult } from './base.js';
import type { Direction } from '../game-state.js';
export declare class ExpectedValueStrategy extends BaseStrategy {
    constructor(options?: Record<string, any>);
    computeVote(parsed: any, balance: number, state: any): VoteResult;
    /**
     * Counter-bid analysis
     */
    shouldCounterBid(parsed: any, balance: number, state: any, ourVote: any): VoteResult;
    estimateWinProb(team: any, parsed: any): number;
    analyzeTeams(parsed: any, currentTeamId: string | null): any;
    calculateExpectedValue(team: any, parsed: any, isCurrentTeam?: boolean, bfsDist?: number | null): number;
    /**
     * Score a direction considering:
     * 1. BFS path distance to target fruit (not just hex distance)
     * 2. Flood-fill reachable area (dead-end avoidance)
     * 3. Avoiding wrong-team fruit collisions
     * 4. Safety (exit count from new position)
     */
    scoreDirection(dir: Direction, parsed: any, targetTeam: any, explicitTargetFruit?: any): number;
}
//# sourceMappingURL=expected-value.d.ts.map