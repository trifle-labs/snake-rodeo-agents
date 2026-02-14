/**
 * Random Strategy
 *
 * Makes random valid moves. Useful for testing or when you just want chaos.
 */

import { BaseStrategy, VoteResult } from './base.js';

export class RandomStrategy extends BaseStrategy {
  constructor(options: Record<string, any> = {}) {
    super(
      'random',
      'Random valid moves. For testing or chaos.',
      options
    );
  }

  computeVote(parsed: any, balance: number, state: any): VoteResult {
    if (!this.shouldPlay(parsed, balance, state)) {
      return null;
    }

    // Pick random direction
    const dirs: string[] = parsed.validDirections;
    const direction = dirs[Math.floor(Math.random() * dirs.length)];

    // Pick random team
    const teams = parsed.teams.filter((t: any) => t.closestFruit);
    const team = teams.length > 0
      ? teams[Math.floor(Math.random() * teams.length)]
      : parsed.teams[0];

    return {
      direction,
      team,
      amount: parsed.minBid,
      reason: 'random',
    };
  }
}
