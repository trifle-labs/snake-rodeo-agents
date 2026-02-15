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
import {
  ALL_DIRECTION_OFFSETS,
  ALL_OPPOSITES,
  gridDistance,
  getTotalCells,
  countExits,
  bfsDistance,
  floodFillSize,
} from '../game-state.js';

/** Per-team stats computed during analysis */
interface TeamStat {
  team: ParsedTeam;
  ev: number;
  isCurrentTeam: boolean;
  bfsDist: number;
  bfsClosestFruit: HexPos | null;
}

/** Result of analyzeTeams — describes which team to back and why */
interface TeamAnalysis {
  shouldPlay: boolean;
  recommendedTeam: ParsedTeam | null;
  bfsDist?: number;
  bfsClosestFruit?: HexPos | null;
  reason: string;
  teamEV: number;
}

export class ExpectedValueStrategy extends BaseStrategy {
  constructor(options: Record<string, unknown> = {}) {
    super(
      'expected-value',
      'Maximizes expected value per vote. BFS pathfinding with dead-end avoidance.',
      options
    );
  }

  computeVote(parsed: ParsedGameState, balance: number, state: AgentState): VoteResult {
    if (!this.shouldPlay(parsed, balance, state)) {
      return null;
    }

    const analysis = this.analyzeTeams(parsed, state.currentTeam);

    if (!analysis.shouldPlay) {
      return { skip: true, reason: analysis.reason };
    }

    const targetTeam = analysis.recommendedTeam!;
    // Use BFS-closest fruit (may differ from hex-closest)
    const targetFruit = analysis.bfsClosestFruit || targetTeam.closestFruit?.fruit || null;
    const fruitDist = analysis.bfsDist ?? targetTeam.closestFruit?.distance ?? Infinity;

    // Score all valid directions
    const dirScores = parsed.validDirections.map((dir) => ({
      dir,
      score: this.scoreDirection(dir, parsed, targetTeam, targetFruit),
    })).sort((a, b) => b.score - a.score);

    const bestDir = dirScores[0]?.dir;
    if (!bestDir) return null;

    let newDist: number | string = '?';
    if (targetFruit) {
      const offset = ALL_DIRECTION_OFFSETS[bestDir];
      const newPos: HexPos = {
        q: parsed.head.q + offset.q,
        r: parsed.head.r + offset.r,
      };
      newDist = gridDistance(newPos, targetFruit, parsed.gridType);
    }

    // === Vote efficiency (v3 — multi-agent aware) ===
    // In multi-agent games, skipping forfeits payout share. The math:
    //   profit = (R-S) * R * minBid / (3R-S)  [S = skips]
    // Every skip reduces profit by exactly 1/R of a non-skipper's profit.
    // Therefore: never skip voluntarily. Only the balance check in
    // shouldPlay() (balance < minBid) will prevent voting.

    const bidAmount = parsed.minBid;
    const distInfo = `d:${fruitDist}\u2192${newDist}`;

    return {
      direction: bestDir,
      team: targetTeam,
      amount: bidAmount,
      reason: `${analysis.reason} ${distInfo}`,
    };
  }

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
  shouldCounterBid(parsed: ParsedGameState, balance: number, state: AgentState, ourVote: VoteAction): VoteResult {
    const cost = parsed.minBid;

    // Hard budget limits
    if (cost > balance) return null;
    if ((state.roundBudgetRemaining || 0) < cost) return null;

    // Only counter-bid when fruit is immediately reachable (distance 1)
    // AND the expected return strongly justifies the escalated cost.
    const team = ourVote.team;
    const fruitDist = team.closestFruit?.distance ?? Infinity;
    if (fruitDist > 1) return null;

    // Cost-benefit: P(win) * payout_share vs cost (require 3x return)
    const winProb = this.estimateWinProb(team, parsed);
    const teamVoters = Math.max((state.roundVoteCount || 0) + 1, 2);
    const expectedReturn = winProb * (parsed.prizePool / teamVoters);

    if (expectedReturn < cost * 3) return null;

    return {
      direction: ourVote.direction,
      team: ourVote.team,
      amount: cost,
      reason: `counter(cost:${cost},d:${fruitDist},ev:${expectedReturn.toFixed(1)})`,
    };
  }

  estimateWinProb(team: ParsedTeam, parsed: ParsedGameState): number {
    const fruitsNeeded = parsed.fruitsToWin - team.score;
    const fruitDist = team.closestFruit?.distance ?? 10;

    if (!team.closestFruit) return 0;
    if (fruitsNeeded <= 0) return 0;
    if (fruitsNeeded === 1 && fruitDist <= 1) return 0.9;
    if (fruitsNeeded === 1 && fruitDist <= 2) return 0.7;
    if (fruitsNeeded === 1) return 0.5;
    if (fruitsNeeded === 2 && fruitDist <= 2) return 0.4;
    if (fruitsNeeded === 2) return 0.25;
    if (fruitsNeeded === 3) return 0.15;
    return 0.1;
  }

  analyzeTeams(parsed: ParsedGameState, currentTeamId: string | null): TeamAnalysis {
    const teamStats: TeamStat[] = parsed.teams
      .filter((team) => team.closestFruit !== null)
      .map((team) => {
        const isCurrentTeam = team.id === currentTeamId;

        // Find BFS-closest fruit across ALL team fruits (not just hex-closest).
        // Uses time-aware BFS (tail segments clear as snake moves).
        let bfsDist = team.closestFruit?.distance ?? Infinity;
        let bfsClosestFruit: HexPos | null = team.closestFruit?.fruit ?? null;
        const teamFruits = parsed.raw?.apples?.[team.id] || [];
        for (const fruit of teamFruits) {
          const bfs = bfsDistance(parsed.head, fruit, parsed.raw, true, true);
          if (bfs.distance < bfsDist) {
            bfsDist = bfs.distance;
            bfsClosestFruit = fruit;
          }
        }

        const ev = this.calculateExpectedValue(team, parsed, isCurrentTeam, bfsDist);
        return { team, ev, isCurrentTeam, bfsDist, bfsClosestFruit };
      });

    if (teamStats.length === 0) {
      return {
        shouldPlay: false,
        recommendedTeam: null,
        reason: 'no_teams_with_fruits',
        teamEV: 0,
      };
    }

    const contrarian = this.getOption('contrarian', false);

    let pick: TeamStat;

    if (contrarian) {
      // Prefer unpopular teams with reachable fruit
      const ranked = [...teamStats]
        .filter((t) => t.bfsDist < Infinity)
        .sort((a, b) => {
          const scoreA = a.team.score * 20 - (a.team.pool || 0) * 15 - a.bfsDist * 20;
          const scoreB = b.team.score * 20 - (b.team.pool || 0) * 15 - b.bfsDist * 20;
          return scoreB - scoreA;
        });
      pick = ranked[0] || teamStats[0];
    } else {
      // === EV-driven team selection with probabilistic defection (v4) ===
      //
      // Pick the team with the highest expected payout per vote.
      // This naturally handles the "defection" problem: when multiple
      // agents pile onto the same team, the pool grows and each voter's
      // share shrinks. At some point, a less-popular team with decent
      // win probability offers a better individual return.
      //
      // All-pay payout flow:
      //   1. Every voter pays minBid regardless of outcome (all-pay)
      //   2. All bets from ALL teams go into the prize pool
      //   3. When a team wins, the ENTIRE prize pool is split among
      //      that team's voters proportionally by vote count
      //   4. Your own bets are in the pool — if your team wins, they
      //      come back as part of your share, but diluted by teammates.
      //      With 3 teammates, you get back ~1/3 of your own contribution
      //      plus ~1/3 of everyone else's. More teammates = less per head.
      //
      // Probabilistic defection: when multiple teams have comparable EV,
      // randomly select weighted by EV rather than always picking the max.
      // This breaks symmetry between identical agents — two EV bots seeing
      // the same state may independently pick different teams, splitting
      // the payout dilution and potentially both profiting more.
      const reachable = [...teamStats].filter((t) => t.bfsDist < Infinity && t.ev > 0);

      if (reachable.length === 0) {
        pick = teamStats[0];
      } else {
        const best = reachable.reduce((a, b) => b.ev > a.ev ? b : a);

        // Find teams within striking distance (EV >= 40% of best).
        // Below this threshold, the team is clearly worse and not worth
        // the gamble. Above it, the EV gap is close enough that pool
        // dilution on the crowded team could make the underdog worthwhile.
        const defectThreshold = this.getOption('defectThreshold', 0.4) as number;
        const viable = reachable.filter((t) => t.ev >= best.ev * defectThreshold);

        if (viable.length <= 1) {
          // Only one viable team — no decision to make
          pick = best;
        } else {
          // Weighted random selection: probability proportional to EV.
          // Higher EV = more likely to be picked, but not guaranteed.
          // This means two identical agents will sometimes split teams.
          const totalEV = viable.reduce((sum, t) => sum + t.ev, 0);
          const roll = Math.random() * totalEV;
          let cumulative = 0;
          pick = viable[viable.length - 1];
          for (const t of viable) {
            cumulative += t.ev;
            if (roll < cumulative) {
              pick = t;
              break;
            }
          }
        }
      }
    }

    let reason: string;
    if (!currentTeamId || pick.team.id === currentTeamId) {
      reason = `back(${pick.team.id},s:${pick.team.score},d:${pick.bfsDist},ev:${pick.ev.toFixed(1)})`;
    } else {
      reason = `defect(${pick.team.id},s:${pick.team.score},d:${pick.bfsDist},ev:${pick.ev.toFixed(1)})`;
    }

    return {
      shouldPlay: true,
      recommendedTeam: pick.team,
      bfsDist: pick.bfsDist,
      bfsClosestFruit: pick.bfsClosestFruit,
      reason,
      teamEV: pick.ev,
    };
  }

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
  calculateExpectedValue(team: ParsedTeam, parsed: ParsedGameState, isCurrentTeam: boolean = false, bfsDist: number | null = null): number {
    const fruitsNeeded = parsed.fruitsToWin - team.score;
    const dist = bfsDist ?? team.closestFruit?.distance ?? 10;

    if (!team.closestFruit || fruitsNeeded <= 0) return 0;
    if (dist === Infinity) return 0;

    // --- Base win probability from game position ---
    let baseWinProb: number;
    if (fruitsNeeded === 1 && dist <= 1) baseWinProb = 0.9;
    else if (fruitsNeeded === 1 && dist <= 3) baseWinProb = 0.6;
    else if (fruitsNeeded === 1) baseWinProb = 0.3;
    else if (fruitsNeeded === 2 && dist <= 2) baseWinProb = 0.35;
    else if (fruitsNeeded === 2) baseWinProb = 0.2;
    else baseWinProb = 0.1;

    // --- Direction control factor (mild) ---
    // In last-vote-wins, more voters on a team = more chances to cast
    // the final vote. But a solo agent on an empty team still has
    // PERFECT control when they do vote — just fewer total votes.
    //
    // We model "what if I join?" by including our hypothetical vote
    // in the team's pool. This way an empty team we'd defect to
    // gets credit for the control we'd bring.
    const totalPools = parsed.teams.reduce((sum, t) => sum + (t.pool || 0), 0);
    const teamPool = team.pool || 0;
    const minBid = parsed.initialMinBid || 1;

    const ourContrib = isCurrentTeam ? 0 : minBid;
    const effectiveTeamPool = teamPool + ourContrib;
    const effectiveTotalPools = totalPools + ourContrib;

    let controlShare: number;
    if (effectiveTotalPools === 0) {
      controlShare = 1 / parsed.teams.length;
    } else {
      controlShare = effectiveTeamPool / effectiveTotalPools;
    }

    // Mild influence: 70% base position + 30% control.
    // A solo defector with close fruit keeps ~70% of base winProb.
    // A dominant team gets up to 100%. Not a dealbreaker, just a nudge.
    const controlBoost = Math.min(controlShare * parsed.teams.length, 1);
    const winProb = baseWinProb * (0.7 + 0.3 * controlBoost);

    // --- Payout dilution (unique voters, not cumulative votes) ---
    // pool / minBid over-counts because the same agents vote every round.
    // A pool of 10 with minBid=1 after 5 rounds could be 2 agents × 5,
    // not 10 separate voters. Estimate unique voters by dividing by the
    // number of rounds played (each voter contributes ~1 vote per round).
    const round = parsed.round ?? 0;
    const votesPerVoter = Math.max(round, 1);
    const estimatedVoters = Math.max(teamPool / (minBid * votesPerVoter), 1);

    // If joining a new team, add ourselves to the voter count
    const totalVoters = estimatedVoters + (isCurrentTeam ? 0 : 1);
    const ourShare = 1 / totalVoters;

    const prizePool = parsed.prizePool;
    const payoutIfWin = prizePool * ourShare;

    return winProb * payoutIfWin;
  }

  /**
   * Score a direction considering:
   * 1. BFS path distance to target fruit (not just hex distance)
   * 2. Flood-fill reachable area (dead-end avoidance)
   * 3. Avoiding wrong-team fruit collisions
   * 4. Safety (exit count from new position)
   */
  scoreDirection(dir: Direction, parsed: ParsedGameState, targetTeam: ParsedTeam, explicitTargetFruit: HexPos | null = null): number {
    const offset = ALL_DIRECTION_OFFSETS[dir];
    const newPos: HexPos = {
      q: parsed.head.q + offset.q,
      r: parsed.head.r + offset.r,
    };

    let score = 0;

    // Use BFS-closest fruit if provided, otherwise fall back to hex-closest
    const targetFruit = explicitTargetFruit || targetTeam.closestFruit?.fruit || null;

    // === Fruit proximity score (BFS-based) ===
    if (targetFruit) {
      const dist = gridDistance(newPos, targetFruit, parsed.gridType);

      if (dist === 0) {
        // Eating the fruit! Huge bonus.
        score += 5000;
      } else {
        // Time-aware BFS distance from the new position to the target fruit
        // (tail segments clear as snake moves, enabling shortcuts)
        const bfs = bfsDistance(newPos, targetFruit, parsed.raw, false, true);
        const pathDist = bfs.distance;

        if (pathDist === Infinity) {
          // Can't reach the fruit from here -- don't penalize too hard,
          // just don't give any fruit bonus. Safety will dominate.
          score += 0;
        } else {
          // Score inversely proportional to path distance
          // Close fruit = high score. Max ~900 at dist 1.
          score += Math.max(0, 1000 - pathDist * 100);
        }
      }
    }

    // === Opportunistic: check if ANY reachable fruit is close ===
    // Even if it's not our target, being near fruit means flexibility
    if (!targetFruit || gridDistance(newPos, targetFruit, parsed.gridType) > 3) {
      for (const team of parsed.teams) {
        const teamFruits = parsed.raw?.apples?.[team.id] || [];
        for (const fruit of teamFruits) {
          if (fruit.q === newPos.q && fruit.r === newPos.r) continue; // handled above
          const d = gridDistance(newPos, fruit, parsed.gridType);
          if (d <= 2) {
            // Being near ANY fruit gives a small flexibility bonus
            score += (3 - d) * 10;
          }
        }
      }
    }

    // === Wrong-fruit avoidance ===
    // Check if this move would eat a fruit from a different team
    for (const team of parsed.teams) {
      if (team.id === targetTeam.id) continue;
      const teamFruits = parsed.raw?.apples?.[team.id] || [];
      for (const fruit of teamFruits) {
        if (fruit.q === newPos.q && fruit.r === newPos.r) {
          // Eating wrong team's fruit -- bad, it helps them
          score -= 2000;
        }
      }
    }

    // === Safety: flood-fill reachable area ===
    // Larger reachable area = less risk of getting trapped
    const reachable = floodFillSize(newPos, parsed.raw, ALL_OPPOSITES[dir]);
    const totalCells = getTotalCells(parsed.gridRadius, parsed.gridType);

    if (reachable <= 2) {
      // Dead end or near dead end -- very dangerous
      score -= 3000;
    } else if (reachable <= parsed.snakeLength + 2) {
      // Reachable area is barely larger than snake -- risky
      score -= 1000;
    } else {
      // Reward proportional to reachable area (normalized)
      score += (reachable / totalCells) * 100;
    }

    // === Exit count bonus (immediate safety) ===
    const exits = countExits(newPos, parsed.raw, ALL_OPPOSITES[dir]);
    score += exits * 10;

    // === Slight center preference (tiebreaker) ===
    const distFromCenter = gridDistance(newPos, { q: 0, r: 0 }, parsed.gridType);
    score += (parsed.gridRadius - distFromCenter) * 2;

    return score;
  }
}
