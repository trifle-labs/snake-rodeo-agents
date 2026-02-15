/**
 * Expected Value Strategy -- v4
 *
 * Maximizes per-agent ROI in multi-agent competitive games.
 *
 * v4 improvements over v3:
 * - EV-driven team selection: picks team with highest expected payout
 *   per vote, not just the leader. Naturally defects from crowded teams
 *   when a less-popular team offers better individual returns.
 * - Pool-aware win probability: teams with more voters are more likely
 *   to control the snake's direction (last-vote-wins mechanic).
 * - All-pay payout modeling: all bets go to the prize pool regardless
 *   of outcome. Winners split the entire pool. Your own lost bets may
 *   partially return if your team wins, but shared with teammates.
 *
 * v3 features retained:
 * - BFS pathfinding with dead-end avoidance
 * - Proximity-gated voting: always vote near fruit, skip only when far
 * - Closest-fruit urgency: never skips when ANY fruit is ≤2 BFS steps away
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
     * Counter-bid cost-benefit analysis.
     *
     * The real game mechanic: each counter-bid doubles minBid. Counter-
     * bidding is only profitable when the stake justifies the escalated
     * cost — specifically, when fruit is imminent (1-2 steps away) and
     * correcting the direction would eat it.
     *
     * Simulation data shows that broad counter-bidding is ROI-negative:
     * aggressive countering spends ~26% more but only earns ~16% more
     * payout. The optimal approach is surgical — only counter when the
     * expected value of correcting direction exceeds the escalated cost.
     */
    /**
     * Counter-bid cost-benefit analysis.
     *
     * The real game mechanic: each counter-bid doubles minBid. Counter-
     * bidding is only profitable when the stake justifies the escalated
     * cost — specifically, when fruit is imminent (1 step away) and
     * correcting the direction would eat it.
     *
     * Simulation data shows that broad counter-bidding is ROI-negative:
     * aggressive countering spends ~26% more but only earns ~16% more
     * payout. The optimal approach is surgical — only counter when the
     * expected value of correcting direction exceeds the escalated cost.
     *
     * Tested thresholds (500-game tournaments, proportional payout):
     *   dist ≤ 2, 2x return → 21.2% ROI
     *   dist ≤ 1, 3x return → 23.4% ROI  ← best
     *   no counter-bidding  → ~25% ROI but loses clutch fruit grabs
     */
    shouldCounterBid(parsed: ParsedGameState, balance: number, state: AgentState, ourVote: VoteAction): VoteResult;
    estimateWinProb(team: ParsedTeam, parsed: ParsedGameState): number;
    analyzeTeams(parsed: ParsedGameState, currentTeamId: string | null): TeamAnalysis;
    /**
     * Expected value of one vote on a given team.
     *
     * Models the all-pay auction payout:
     *   EV = P(team wins) × prizePool × ourShare
     *
     * Key insight for defection:
     *   All bets go into one prize pool regardless of outcome (all-pay).
     *   When a team wins, the ENTIRE pool is split among that team's
     *   voters by vote count. Your own bets are in there — if your team
     *   wins they come back as part of your share, but diluted by
     *   teammates. With 3 teammates you get ~1/3 of your own contribution
     *   back plus ~1/3 of everyone else's. More teammates = less per head.
     *
     *   So: crowded team = high win chance, small slice per voter.
     *       Empty team   = lower win chance, but you keep everything.
     *
     *   The agent should defect when the solo payout on a rival team
     *   outweighs the diluted payout on the consensus team.
     */
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