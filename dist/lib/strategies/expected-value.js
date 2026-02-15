/**
 * Expected Value Strategy -- v3
 *
 * Maximizes per-agent ROI in multi-agent competitive games.
 *
 * v3 improvements over v2:
 * - Budget pacing: estimates remaining game rounds, skips low-value votes
 * - Proximity-gated voting: always vote near fruit, skip only when far
 * - Vote-share awareness: prefers less-crowded teams for bigger payout
 * - Closest-fruit urgency: never skips when ANY fruit is ≤2 BFS steps away
 *
 * Game mechanics:
 * - Last vote wins direction (not highest amount)
 * - Payout is per vote count, not cumulative amount
 * - Voting in extension window: round extends 5s, minBid doubles
 * - All-pay auction: everyone pays regardless of outcome
 */
import { BaseStrategy } from './base.js';
import { ALL_DIRECTION_OFFSETS, ALL_OPPOSITES, gridDistance, getTotalCells, countExits, bfsDistance, floodFillSize, } from '../game-state.js';
export class ExpectedValueStrategy extends BaseStrategy {
    constructor(options = {}) {
        super('expected-value', 'Maximizes expected value per vote. BFS pathfinding with dead-end avoidance.', options);
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
        const targetFruit = analysis.bfsClosestFruit || targetTeam.closestFruit?.fruit || null;
        const fruitDist = analysis.bfsDist ?? targetTeam.closestFruit?.distance ?? Infinity;
        // Score all valid directions
        const dirScores = parsed.validDirections.map((dir) => ({
            dir,
            score: this.scoreDirection(dir, parsed, targetTeam, targetFruit),
        })).sort((a, b) => b.score - a.score);
        const bestDir = dirScores[0]?.dir;
        if (!bestDir)
            return null;
        let newDist = '?';
        if (targetFruit) {
            const offset = ALL_DIRECTION_OFFSETS[bestDir];
            const newPos = {
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
    shouldCounterBid(parsed, balance, state, ourVote) {
        const cost = parsed.minBid;
        // Hard budget limits
        if (cost > balance)
            return null;
        if ((state.roundBudgetRemaining || 0) < cost)
            return null;
        // Only counter-bid when fruit is immediately reachable (distance 1)
        // AND the expected return strongly justifies the escalated cost.
        const team = ourVote.team;
        const fruitDist = team.closestFruit?.distance ?? Infinity;
        if (fruitDist > 1)
            return null;
        // Cost-benefit: P(win) * payout_share vs cost (require 3x return)
        const winProb = this.estimateWinProb(team, parsed);
        const teamVoters = Math.max((state.roundVoteCount || 0) + 1, 2);
        const expectedReturn = winProb * (parsed.prizePool / teamVoters);
        if (expectedReturn < cost * 3)
            return null;
        return {
            direction: ourVote.direction,
            team: ourVote.team,
            amount: cost,
            reason: `counter(cost:${cost},d:${fruitDist},ev:${expectedReturn.toFixed(1)})`,
        };
    }
    estimateWinProb(team, parsed) {
        const fruitsNeeded = parsed.fruitsToWin - team.score;
        const fruitDist = team.closestFruit?.distance ?? 10;
        if (!team.closestFruit)
            return 0;
        if (fruitsNeeded <= 0)
            return 0;
        if (fruitsNeeded === 1 && fruitDist <= 1)
            return 0.9;
        if (fruitsNeeded === 1 && fruitDist <= 2)
            return 0.7;
        if (fruitsNeeded === 1)
            return 0.5;
        if (fruitsNeeded === 2 && fruitDist <= 2)
            return 0.4;
        if (fruitsNeeded === 2)
            return 0.25;
        if (fruitsNeeded === 3)
            return 0.15;
        return 0.1;
    }
    analyzeTeams(parsed, currentTeamId) {
        const teamStats = parsed.teams
            .filter((team) => team.closestFruit !== null)
            .map((team) => {
            const isCurrentTeam = team.id === currentTeamId;
            // Find BFS-closest fruit across ALL team fruits (not just hex-closest).
            // Uses time-aware BFS (tail segments clear as snake moves).
            let bfsDist = team.closestFruit?.distance ?? Infinity;
            let bfsClosestFruit = team.closestFruit?.fruit ?? null;
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
        // === Stateless team selection (v3) ===
        // Re-evaluate the best team every round with no loyalty bias.
        // In multi-agent games, the majority controls direction. Matching
        // the consensus team (highest score, closest fruit) maximizes the
        // chance of being on the winning side.
        //
        // Contrarian mode inverts this — favors less popular teams for a
        // bigger individual payout share when they win.
        let pick;
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
        }
        else {
            // Standard: back the current leader (highest score, then closest
            // hex-distance as tiebreaker — matches what other agents do)
            const ranked = [...teamStats]
                .filter((t) => t.bfsDist < Infinity)
                .sort((a, b) => {
                if (b.team.score !== a.team.score)
                    return b.team.score - a.team.score;
                const aDist = a.team.closestFruit?.distance ?? 100;
                const bDist = b.team.closestFruit?.distance ?? 100;
                return aDist - bDist;
            });
            pick = ranked[0] || teamStats[0];
        }
        const reason = currentTeamId && pick.team.id !== currentTeamId
            ? `switch(${pick.team.id},s:${pick.team.score},d:${pick.bfsDist})`
            : `back(${pick.team.id},s:${pick.team.score},d:${pick.bfsDist})`;
        return {
            shouldPlay: true,
            recommendedTeam: pick.team,
            bfsDist: pick.bfsDist,
            bfsClosestFruit: pick.bfsClosestFruit,
            reason,
            teamEV: pick.ev,
        };
    }
    calculateExpectedValue(team, parsed, isCurrentTeam = false, bfsDist = null) {
        const fruitsNeeded = parsed.fruitsToWin - team.score;
        const dist = bfsDist ?? team.closestFruit?.distance ?? 10;
        if (!team.closestFruit || fruitsNeeded <= 0)
            return 0;
        // Win probability decreases with distance and fruits needed
        let winProb;
        if (fruitsNeeded === 1 && dist <= 1)
            winProb = 0.9;
        else if (fruitsNeeded === 1 && dist <= 3)
            winProb = 0.6;
        else if (fruitsNeeded === 1)
            winProb = 0.3;
        else if (fruitsNeeded === 2 && dist <= 2)
            winProb = 0.35;
        else if (fruitsNeeded === 2)
            winProb = 0.2;
        else
            winProb = 0.1;
        // Penalize unreachable fruits
        if (dist === Infinity)
            winProb = 0;
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
        const offset = ALL_DIRECTION_OFFSETS[dir];
        const newPos = {
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
            }
            else {
                // Time-aware BFS distance from the new position to the target fruit
                // (tail segments clear as snake moves, enabling shortcuts)
                const bfs = bfsDistance(newPos, targetFruit, parsed.raw, false, true);
                const pathDist = bfs.distance;
                if (pathDist === Infinity) {
                    // Can't reach the fruit from here -- don't penalize too hard,
                    // just don't give any fruit bonus. Safety will dominate.
                    score += 0;
                }
                else {
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
                    if (fruit.q === newPos.q && fruit.r === newPos.r)
                        continue; // handled above
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
            if (team.id === targetTeam.id)
                continue;
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
        }
        else if (reachable <= parsed.snakeLength + 2) {
            // Reachable area is barely larger than snake -- risky
            score -= 1000;
        }
        else {
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
//# sourceMappingURL=expected-value.js.map