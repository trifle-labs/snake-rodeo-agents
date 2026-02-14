/**
 * Base Strategy Class
 *
 * All strategies must extend this class and implement:
 * - computeVote(parsed, balance, state) -> { direction, team, amount, reason } | null
 *
 * Strategies can optionally override:
 * - shouldPlay(parsed, balance, state) -> boolean
 * - shouldCounterBid(parsed, balance, state, ourVote) -> vote object | null
 * - onGameStart(parsed, state) -> void
 * - onGameEnd(parsed, state, didWin) -> void
 * - onRoundEnd(parsed, state) -> void
 */

import type { Direction } from '../game-state.js';
import {
  HEX_DIRECTIONS,
  OPPOSITE_DIRECTIONS,
  countExits,
} from '../game-state.js';

/** Result type for computeVote and shouldCounterBid */
export type VoteResult =
  | { direction: string; team: any; amount: number; reason: string }
  | { skip: true; reason: string }
  | null;

export class BaseStrategy {
  name: string;
  description: string;
  options: Record<string, any>;

  constructor(name: string, description: string, options: Record<string, any> = {}) {
    this.name = name;
    this.description = description;
    this.options = options;
  }

  /**
   * Compute the optimal vote for this round
   * @param parsed - Parsed game state
   * @param balance - Current ball balance
   * @param state - Daemon state (currentTeam, etc.)
   * @returns { direction, team, amount, reason } or null to skip
   */
  computeVote(parsed: any, balance: number, state: any): VoteResult {
    throw new Error('Strategy must implement computeVote()');
  }

  /**
   * Determine if we should participate this round
   * Default: play if we have enough balance
   */
  shouldPlay(parsed: any, balance: number, state: any): boolean {
    if (!parsed?.active) return false;
    if (parsed.validDirections.length === 0) return false;
    if (balance < parsed.minBid) return false;
    return true;
  }

  /**
   * Decide whether to counter-bid when our direction has been overridden.
   *
   * Called mid-round when the snake's currentDirection changed away from
   * what we voted for. Key mechanics:
   * - Last vote wins (not highest amount)
   * - Voting in extension window (<5s left): timer += 5s, minBid *= 2
   * - Payout is per vote count, not cumulative amount
   * - All-pay: everyone pays regardless of outcome
   *
   * @param parsed - Current parsed game state
   * @param balance - Current ball balance
   * @param state - Daemon state with roundSpend tracking
   * @param ourVote - The vote we submitted earlier this round
   * @returns Vote object to counter, or null to let it go
   */
  shouldCounterBid(parsed: any, balance: number, state: any, ourVote: any): VoteResult {
    return null;
  }

  /**
   * Called when a new game starts
   */
  onGameStart(parsed: any, state: any): void {
    // Override in subclass if needed
  }

  /**
   * Called when a game ends
   */
  onGameEnd(parsed: any, state: any, didWin: boolean): void {
    // Override in subclass if needed
  }

  /**
   * Called after each round
   */
  onRoundEnd(parsed: any, state: any): void {
    // Override in subclass if needed
  }

  /**
   * Get option value with default fallback
   */
  getOption<T>(key: string, defaultValue: T): T {
    return this.options[key] ?? defaultValue;
  }

  /**
   * Score a direction based on safety (exits from new position)
   * Higher score = safer
   */
  scoreDirectionSafety(dir: Direction, parsed: any): number {
    const offset = HEX_DIRECTIONS[dir];
    const newPos = {
      q: parsed.head.q + offset.q,
      r: parsed.head.r + offset.r,
    };
    return countExits(newPos, parsed.raw, OPPOSITE_DIRECTIONS[dir] as Direction);
  }

  /**
   * Find the safest valid direction
   */
  findSafestDirection(parsed: any): string | null {
    let best: string | null = null;
    let bestSafety = -1;

    for (const dir of parsed.validDirections) {
      const safety = this.scoreDirectionSafety(dir, parsed);
      if (safety > bestSafety) {
        bestSafety = safety;
        best = dir;
      }
    }

    return best;
  }
}
