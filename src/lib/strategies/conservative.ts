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
import {
  ALL_DIRECTION_OFFSETS,
  ALL_OPPOSITES,
  gridDistance,
  countExits,
} from '../game-state.js';

export class ConservativeStrategy extends BaseStrategy {
  constructor(options: Record<string, unknown> = {}) {
    super(
      'conservative',
      'Minimum bids, prioritizes safety. Risk-averse.',
      options
    );
  }

  shouldPlay(parsed: ParsedGameState, balance: number, state: AgentState): boolean {
    if (!super.shouldPlay(parsed, balance, state)) {
      return false;
    }

    const skipIfBehind = this.getOption('skipIfBehind', true);

    if (skipIfBehind && state.currentTeam) {
      const ourTeam = parsed.teams.find((t) => t.id === state.currentTeam);
      const leadingTeam = [...parsed.teams].sort((a, b) => b.score - a.score)[0];

      // Skip if we're more than 1 fruit behind
      if (ourTeam && leadingTeam && leadingTeam.score - ourTeam.score > 1) {
        return false;
      }
    }

    return true;
  }

  computeVote(parsed: ParsedGameState, balance: number, state: AgentState): VoteResult {
    if (!this.shouldPlay(parsed, balance, state)) {
      return null;
    }

    // Find the safest team to back (leading or tied, with fruits nearby)
    const sortedTeams = [...parsed.teams]
      .filter((t) => t.closestFruit)
      .sort((a, b) => {
        // Primary: highest score
        if (b.score !== a.score) return b.score - a.score;
        // Secondary: closest fruit (safer to reach)
        const aDist = a.closestFruit?.distance ?? 100;
        const bDist = b.closestFruit?.distance ?? 100;
        return aDist - bDist;
      });

    const targetTeam = sortedTeams[0];
    if (!targetTeam) {
      // No team has fruits, just pick safest direction
      const safestDir = this.findSafestDirection(parsed);
      if (!safestDir) return null;

      return {
        direction: safestDir,
        team: parsed.teams[0],
        amount: parsed.minBid,
        reason: 'safest_direction',
      };
    }

    // Find safest direction that also moves toward fruit
    const bestDir = this.findSafeDirectionToward(parsed, targetTeam.closestFruit?.fruit || null);

    if (!bestDir) return null;

    return {
      direction: bestDir,
      team: targetTeam,
      amount: parsed.minBid,
      reason: 'safe_play',
    };
  }

  findSafeDirectionToward(parsed: ParsedGameState, targetFruit: HexPos | null): Direction | null {
    let best: Direction | null = null;
    let bestScore = -Infinity;

    for (const dir of parsed.validDirections) {
      const offset = ALL_DIRECTION_OFFSETS[dir];
      const newPos: HexPos = {
        q: parsed.head.q + offset.q,
        r: parsed.head.r + offset.r,
      };

      // Safety is weighted heavily
      const safety = countExits(newPos, parsed.raw, ALL_OPPOSITES[dir]);
      let score = safety * 15;

      // Bonus for moving toward target
      if (targetFruit) {
        const dist = gridDistance(newPos, targetFruit, parsed.gridType);
        score += (10 - dist) * 3;
      }

      // Only consider safe moves (at least 2 exits)
      if (safety >= 2 && score > bestScore) {
        bestScore = score;
        best = dir;
      }
    }

    // If no safe move found, fall back to safest available
    if (!best) {
      best = this.findSafestDirection(parsed);
    }

    return best;
  }
}
