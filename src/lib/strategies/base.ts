/**
 * Base Strategy Class
 *
 * All strategies must extend this class and implement:
 * - computeVote(parsed, balance, state) -> VoteAction | VoteSkip | null
 *
 * Strategies can optionally override:
 * - shouldPlay(parsed, balance, state) -> boolean
 * - shouldCounterBid(parsed, balance, state, ourVote) -> VoteAction | VoteSkip | null
 * - onGameStart(parsed, state) -> void
 * - onGameEnd(parsed, state, didWin) -> void
 * - onRoundEnd(parsed, state) -> void
 */

import type { Direction, HexPos, ParsedGameState, ParsedTeam } from '../game-state.js';
import {
  ALL_DIRECTION_OFFSETS,
  ALL_OPPOSITES,
  countExits,
} from '../game-state.js';

/** Agent state passed to strategies each round */
export interface AgentState {
  currentTeam: string | null;
  roundSpend: number;
  roundVoteCount: number;
  lastRound: number;
  gamesPlayed: number;
  votesPlaced: number;
  wins: number;
  roundBudgetRemaining?: number;
}

/** A concrete vote: direction + team + amount */
export interface VoteAction {
  direction: Direction;
  team: ParsedTeam;
  amount: number;
  reason: string;
}

/** Explicit skip with reason */
export interface VoteSkip {
  skip: true;
  reason: string;
}

/** Result type for computeVote and shouldCounterBid */
export type VoteResult = VoteAction | VoteSkip | null;

export class BaseStrategy {
  name: string;
  description: string;
  options: Record<string, unknown>;

  constructor(name: string, description: string, options: Record<string, unknown> = {}) {
    this.name = name;
    this.description = description;
    this.options = options;
  }

  /**
   * Compute the optimal vote for this round
   */
  computeVote(parsed: ParsedGameState, balance: number, state: AgentState): VoteResult {
    throw new Error('Strategy must implement computeVote()');
  }

  /**
   * Determine if we should participate this round
   * Default: play if we have enough balance
   */
  shouldPlay(parsed: ParsedGameState, balance: number, state: AgentState): boolean {
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
   */
  shouldCounterBid(parsed: ParsedGameState, balance: number, state: AgentState, ourVote: VoteAction): VoteResult {
    return null;
  }

  /**
   * Called when a new game starts
   */
  onGameStart(parsed: ParsedGameState, state: AgentState): void {
    // Override in subclass if needed
  }

  /**
   * Called when a game ends
   */
  onGameEnd(parsed: ParsedGameState, state: AgentState, didWin: boolean): void {
    // Override in subclass if needed
  }

  /**
   * Called after each round
   */
  onRoundEnd(parsed: ParsedGameState, state: AgentState): void {
    // Override in subclass if needed
  }

  /**
   * Get option value with default fallback
   */
  getOption<T>(key: string, defaultValue: T): T {
    return (this.options[key] ?? defaultValue) as T;
  }

  /**
   * Score a direction based on safety (exits from new position)
   * Higher score = safer
   */
  scoreDirectionSafety(dir: Direction, parsed: ParsedGameState): number {
    const offset = ALL_DIRECTION_OFFSETS[dir];
    const newPos: HexPos = {
      q: parsed.head.q + offset.q,
      r: parsed.head.r + offset.r,
    };
    return countExits(newPos, parsed.raw, ALL_OPPOSITES[dir]);
  }

  /**
   * Find the safest valid direction
   */
  findSafestDirection(parsed: ParsedGameState): Direction | null {
    let best: Direction | null = null;
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
