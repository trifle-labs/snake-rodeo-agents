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
import { BaseStrategy } from './base.js';
import type { VoteResult, AgentState, VoteAction } from './base.js';
import type { Direction, HexPos, ParsedGameState, ParsedTeam } from '../game-state.js';
/** Result of analyzeTeams — describes which team to back and why */
interface TeamAnalysis {
    shouldPlay: boolean;
    recommendedTeam: ParsedTeam | null;
    bfsDist?: number;
    bfsClosestFruit?: HexPos | null;
    reason: string;
    teamEV: number;
}
export declare class ExpectedValueStrategy extends BaseStrategy {
    constructor(options?: Record<string, unknown>);
    computeVote(parsed: ParsedGameState, balance: number, state: AgentState): VoteResult;
    /**
     * Counter-bid analysis
     */
    shouldCounterBid(parsed: ParsedGameState, balance: number, state: AgentState, ourVote: VoteAction): VoteResult;
    estimateWinProb(team: ParsedTeam, parsed: ParsedGameState): number;
    analyzeTeams(parsed: ParsedGameState, currentTeamId: string | null): TeamAnalysis;
    calculateExpectedValue(team: ParsedTeam, parsed: ParsedGameState, isCurrentTeam?: boolean, bfsDist?: number | null): number;
    /**
     * Score a direction considering:
     * 1. BFS path distance to target fruit (not just hex distance)
     * 2. Flood-fill reachable area (dead-end avoidance)
     * 3. Avoiding wrong-team fruit collisions
     * 4. Safety (exit count from new position)
     */
    scoreDirection(dir: Direction, parsed: ParsedGameState, targetTeam: ParsedTeam, explicitTargetFruit?: HexPos | null): number;
}
export {};
//# sourceMappingURL=expected-value.d.ts.map