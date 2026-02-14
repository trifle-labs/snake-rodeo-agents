/**
 * Expected Value Strategy — v2
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

import { BaseStrategy } from './base.mjs';
import {
  HEX_DIRECTIONS,
  OPPOSITE_DIRECTIONS,
  hexDistance,
  countExits,
  bfsDistance,
  floodFillSize,
} from '../game-state.mjs';

export class ExpectedValueStrategy extends BaseStrategy {
  constructor(options = {}) {
    super(
      'expected-value',
      'Maximizes expected value per vote. BFS pathfinding with dead-end avoidance.',
      options
    );
  }

  computeVote(parsed, balance, state) {
    if (!this.shouldPlay(parsed, balance, state)) {
      return null;
    }

    const analysis = this.analyzeTeams(parsed, state.currentTeam);

    if (!analysis.shouldPlay) {
      return { skip: true, reason: analysis.reason };
    }

    const targetTeam = analysis.recommendedTeam;
    // Use BFS-closest fruit (may differ from hex-closest)
    const targetFruit = analysis.bfsClosestFruit || targetTeam.closestFruit?.fruit;
    const fruitDist = analysis.bfsDist ?? targetTeam.closestFruit?.distance ?? '?';

    // Score all valid directions
    const dirScores = parsed.validDirections.map(dir => ({
      dir,
      score: this.scoreDirection(dir, parsed, targetTeam, targetFruit),
    })).sort((a, b) => b.score - a.score);

    const bestDir = dirScores[0]?.dir;
    if (!bestDir) return null;

    let newDist = '?';
    if (targetFruit) {
      const offset = HEX_DIRECTIONS[bestDir];
      const newPos = {
        q: parsed.head.q + offset.q,
        r: parsed.head.r + offset.r,
      };
      newDist = hexDistance(newPos, targetFruit);
    }

    // === Vote efficiency optimization ===
    // The snake's direction and winning team persist from last round.
    // If the current direction is already what we want AND
    // the current winning team is our team, skip voting to save balls.
    const currentDir = parsed.currentDirection;
    const currentWinTeam = parsed.currentWinningTeam;
    if (
      currentDir === bestDir &&
      currentWinTeam === targetTeam.id &&
      state.currentTeam === targetTeam.id
    ) {
      return { skip: true, reason: `aligned(${bestDir},${targetTeam.id})` };
    }

    // Note: we do NOT skip when winning team differs, because if we
    // don't vote, fruit eaten this round won't count for our team.

    const bidAmount = parsed.minBid;
    const distInfo = `d:${fruitDist}→${newDist}`;

    return {
      direction: bestDir,
      team: targetTeam,
      amount: bidAmount,
      reason: `${analysis.reason} ${distInfo}`,
    };
  }

  /**
   * Counter-bid analysis
   */
  shouldCounterBid(parsed, balance, state, ourVote) {
    const maxExtensions = this.getOption('maxCounterExtensions', 1);

    if (parsed.extensions > maxExtensions) return null;
    if (parsed.minBid > balance * 0.1) return null;
    if ((state.roundBudgetRemaining || 0) < parsed.minBid) return null;

    const effectiveCost = parsed.inExtensionWindow ? parsed.minBid * 2 : parsed.minBid;
    const teamVoteCount = (state.roundVoteCount || 0) + 1;
    const payoutPerVote = parsed.prizePool / Math.max(teamVoteCount * 2, 1);

    const team = ourVote.team;
    const winProb = this.estimateWinProb(team, parsed);
    const expectedReturn = winProb * payoutPerVote;

    if (expectedReturn < effectiveCost * 0.5) return null;

    return {
      direction: ourVote.direction,
      team: ourVote.team,
      amount: parsed.minBid,
      reason: `counter (ext:${parsed.extensions}, ev:${expectedReturn.toFixed(1)})`,
    };
  }

  estimateWinProb(team, parsed) {
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

  analyzeTeams(parsed, currentTeamId) {
    const teamStats = parsed.teams
      .filter(team => team.closestFruit !== null)
      .map(team => {
        const isCurrentTeam = team.id === currentTeamId;

        // Find BFS-closest fruit across ALL team fruits (not just hex-closest).
        // Uses time-aware BFS (tail segments clear as snake moves).
        let bfsDist = team.closestFruit?.distance ?? Infinity;
        let bfsClosestFruit = team.closestFruit?.fruit;
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

    teamStats.sort((a, b) => b.ev - a.ev);

    const currentTeam = teamStats.find(t => t.team.id === currentTeamId);

    // === Game-theoretic team selection ===
    // Since "last vote wins direction", our individual vote only matters if
    // it's the last one. We should back teams that OTHER players are also
    // backing — the snake will naturally move toward popular teams' fruits.

    // Find the leading team (highest score) and the team with most community support (pool)
    const leadingTeam = [...teamStats].sort((a, b) => {
      if (b.team.score !== a.team.score) return b.team.score - a.team.score;
      return (b.team.pool || 0) - (a.team.pool || 0);
    })[0];

    // The currently winning team for this round (who has momentum right now)
    const currentWinningTeamId = parsed.currentWinningTeam;
    const momentumTeam = currentWinningTeamId
      ? teamStats.find(t => t.team.id === currentWinningTeamId)
      : null;

    // Early game — join best team considering score + community + distance
    if (!currentTeamId) {
      // Composite score: heavily weight leading score, then community pool, then proximity
      const ranked = [...teamStats]
        .filter(t => t.bfsDist < Infinity)
        .sort((a, b) => {
          // Primary: score (closer to winning is better)
          const scoreWeight = 100;
          const scoreA = a.team.score * scoreWeight;
          const scoreB = b.team.score * scoreWeight;

          // Secondary: community pool (more popular = better, since last-vote-wins means majority controls direction)
          const poolWeight = 10;
          const poolA = (a.team.pool || 0) * poolWeight;
          const poolB = (b.team.pool || 0) * poolWeight;

          // Tertiary: proximity (closer fruit = better)
          const distPenalty = 5;
          const distA = a.bfsDist * distPenalty;
          const distB = b.bfsDist * distPenalty;

          return (scoreB + poolB - distB) - (scoreA + poolA - distA);
        });

      const pick = ranked[0] || teamStats[0];
      return {
        shouldPlay: true,
        recommendedTeam: pick.team,
        bfsDist: pick.bfsDist,
        bfsClosestFruit: pick.bfsClosestFruit,
        reason: `join(s:${pick.team.score},d:${pick.bfsDist},p:${(pick.team.pool||0).toFixed(0)})`,
        teamEV: pick.ev,
      };
    }

    // Staying vs switching: prefer current team unless it's clearly losing
    if (currentTeam) {
      const fruitsNeeded = parsed.fruitsToWin - currentTeam.team.score;
      const leaderScore = leadingTeam?.team.score || 0;
      const ourScore = currentTeam.team.score;
      const scoreDiff = leaderScore - ourScore;

      // If our fruit is reachable and we're not hopelessly behind, stay loyal
      if (fruitsNeeded > 0 && currentTeam.team.closestFruit && currentTeam.bfsDist < Infinity) {
        // Check if another team is about to win and we should bandwagon.
        // Switch when: (a) another team needs just 1 fruit AND is close to it,
        // AND we're behind them in score. Even 1 fruit behind is enough to switch.
        const aboutToWin = teamStats.find(t =>
          !t.isCurrentTeam &&
          (parsed.fruitsToWin - t.team.score) === 1 &&
          t.bfsDist <= 2 &&
          t.bfsDist < Infinity
        );

        if (aboutToWin && scoreDiff >= 1) {
          return {
            shouldPlay: true,
            recommendedTeam: aboutToWin.team,
            bfsDist: aboutToWin.bfsDist,
            bfsClosestFruit: aboutToWin.bfsClosestFruit,
            reason: `bandwagon(${aboutToWin.team.id},s:${aboutToWin.team.score},d:${aboutToWin.bfsDist})`,
            teamEV: aboutToWin.ev,
          };
        }

        // Also bandwagon if another team is dominating (2+ more fruits than us)
        // even if they're not yet 1 away from winning
        const dominator = teamStats.find(t =>
          !t.isCurrentTeam &&
          t.team.score > ourScore + 1 &&
          t.bfsDist < Infinity
        );

        if (dominator && fruitsNeeded > 1) {
          return {
            shouldPlay: true,
            recommendedTeam: dominator.team,
            bfsDist: dominator.bfsDist,
            bfsClosestFruit: dominator.bfsClosestFruit,
            reason: `join-leader(${dominator.team.id},s:${dominator.team.score},d:${dominator.bfsDist})`,
            teamEV: dominator.ev,
          };
        }

        return {
          shouldPlay: true,
          recommendedTeam: currentTeam.team,
          bfsDist: currentTeam.bfsDist,
          bfsClosestFruit: currentTeam.bfsClosestFruit,
          reason: `loyal(n:${fruitsNeeded},d:${currentTeam.bfsDist})`,
          teamEV: currentTeam.ev,
        };
      }

      // Fruit unreachable — find best alternative
      const reachableTeams = teamStats.filter(t => t.bfsDist < Infinity);
      if (reachableTeams.length > 0) {
        const best = reachableTeams[0];
        return {
          shouldPlay: true,
          recommendedTeam: best.team,
          bfsDist: best.bfsDist,
          bfsClosestFruit: best.bfsClosestFruit,
          reason: best.team.id === currentTeamId
            ? `loyal-alt(d:${best.bfsDist})`
            : `switch(unreachable→${best.team.id},d:${best.bfsDist})`,
          teamEV: best.ev,
        };
      }

      // All blocked
      if (teamStats.length > 0) {
        return {
          shouldPlay: true,
          recommendedTeam: teamStats[0].team,
          bfsDist: teamStats[0].bfsDist,
          bfsClosestFruit: teamStats[0].bfsClosestFruit,
          reason: 'survive(all_blocked)',
          teamEV: 0,
        };
      }
    }

    return {
      shouldPlay: true,
      recommendedTeam: teamStats[0].team,
      bfsDist: teamStats[0].bfsDist,
      bfsClosestFruit: teamStats[0].bfsClosestFruit,
      reason: 'best_ev',
      teamEV: teamStats[0].ev,
    };
  }

  calculateExpectedValue(team, parsed, isCurrentTeam = false, bfsDist = null) {
    const fruitsNeeded = parsed.fruitsToWin - team.score;
    const dist = bfsDist ?? team.closestFruit?.distance ?? 10;

    if (!team.closestFruit || fruitsNeeded <= 0) return 0;

    // Win probability decreases with distance and fruits needed
    let winProb;
    if (fruitsNeeded === 1 && dist <= 1) winProb = 0.9;
    else if (fruitsNeeded === 1 && dist <= 3) winProb = 0.6;
    else if (fruitsNeeded === 1) winProb = 0.3;
    else if (fruitsNeeded === 2 && dist <= 2) winProb = 0.35;
    else if (fruitsNeeded === 2) winProb = 0.2;
    else winProb = 0.1;

    // Penalize unreachable fruits
    if (dist === Infinity) winProb = 0;

    const pool = team.pool || 0;
    const prizePool = parsed.prizePool;
    const estimatedTeamVotes = Math.max(pool / (parsed.initialMinBid || 1), 1);
    const ourShare = 1 / (estimatedTeamVotes + (isCurrentTeam ? 0 : 1));
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
  scoreDirection(dir, parsed, targetTeam, explicitTargetFruit = null) {
    const offset = HEX_DIRECTIONS[dir];
    const newPos = {
      q: parsed.head.q + offset.q,
      r: parsed.head.r + offset.r,
    };

    let score = 0;

    // Use BFS-closest fruit if provided, otherwise fall back to hex-closest
    const targetFruit = explicitTargetFruit || targetTeam.closestFruit?.fruit;

    // === Fruit proximity score (BFS-based) ===
    if (targetFruit) {
      const dist = hexDistance(newPos, targetFruit);

      if (dist === 0) {
        // Eating the fruit! Huge bonus.
        score += 5000;
      } else {
        // Time-aware BFS distance from the new position to the target fruit
        // (tail segments clear as snake moves, enabling shortcuts)
        const bfs = bfsDistance(newPos, targetFruit, parsed.raw, false, true);
        const pathDist = bfs.distance;

        if (pathDist === Infinity) {
          // Can't reach the fruit from here — don't penalize too hard,
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
    if (!targetFruit || hexDistance(newPos, targetFruit) > 3) {
      for (const team of parsed.teams) {
        const teamFruits = parsed.raw?.apples?.[team.id] || [];
        for (const fruit of teamFruits) {
          if (fruit.q === newPos.q && fruit.r === newPos.r) continue; // handled above
          const d = hexDistance(newPos, fruit);
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
          // Eating wrong team's fruit — bad, it helps them
          score -= 2000;
        }
      }
    }

    // === Safety: flood-fill reachable area ===
    // Larger reachable area = less risk of getting trapped
    const reachable = floodFillSize(newPos, parsed.raw, OPPOSITE_DIRECTIONS[dir]);
    const totalCells = getTotalCells(parsed.gridRadius);

    if (reachable <= 2) {
      // Dead end or near dead end — very dangerous
      score -= 3000;
    } else if (reachable <= parsed.snakeLength + 2) {
      // Reachable area is barely larger than snake — risky
      score -= 1000;
    } else {
      // Reward proportional to reachable area (normalized)
      score += (reachable / totalCells) * 100;
    }

    // === Exit count bonus (immediate safety) ===
    const exits = countExits(newPos, parsed.raw, OPPOSITE_DIRECTIONS[dir]);
    score += exits * 10;

    // === Slight center preference (tiebreaker) ===
    const distFromCenter = hexDistance(newPos, { q: 0, r: 0 });
    score += (parsed.gridRadius - distFromCenter) * 2;

    return score;
  }
}

/**
 * Total cells in a hex grid of given radius
 */
function getTotalCells(radius) {
  // 1 + 6 + 12 + ... = 3*r*(r+1) + 1
  return 3 * radius * (radius + 1) + 1;
}
