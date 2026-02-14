/**
 * Optional Telegram logging for game events.
 *
 * Standalone -- no OpenClaw or skill-wrapper dependencies.
 * Uses native fetch(), so Node 18+ is required.
 */

import type { ParsedTeam } from './game-state.js';

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export class TelegramLogger {
  private botToken: string;
  private chatId: string;

  constructor(config: TelegramConfig) {
    this.botToken = config.botToken;
    this.chatId = config.chatId;
  }

  /** Send an HTML-formatted message. Returns true on success. */
  async send(text: string): Promise<boolean> {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.chatId,
            text,
            parse_mode: 'HTML',
          }),
        },
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Message formatters
// ---------------------------------------------------------------------------

export function formatVote(
  round: number,
  direction: string,
  team: ParsedTeam,
  amount: number,
  balance: number,
  teams: ParsedTeam[],
  reason?: string,
): string {
  const scoreStr = teams
    .map(t => `${t.emoji || t.id}${t.score}`)
    .join(' ');
  const reasonStr = reason ? ` | ${reason}` : '';
  return `🐍 R${round} ${direction.toUpperCase()} ${team.emoji}${team.id} x${amount} | bal:${balance.toFixed(1)} | ${scoreStr}${reasonStr}`;
}

export function formatGameEnd(winner: ParsedTeam, didWin: boolean): string {
  const emoji = didWin ? '🎉' : '🏁';
  const suffix = didWin ? ' (we won!)' : '';
  return `${emoji} Game ended! Winner: ${winner.emoji} ${winner.name}${suffix}`;
}

export function formatTeamSwitch(
  fromTeam: string | null,
  toTeam: ParsedTeam,
  reason: string,
): string {
  if (!fromTeam) {
    return `🎯 Joining team: ${toTeam.emoji} ${toTeam.name}`;
  }
  return `🔄 Switching: ${fromTeam} → ${toTeam.emoji} ${toTeam.name} (${reason})`;
}

export function formatError(message: string): string {
  return `❌ ${message}`;
}

export function formatWarning(message: string): string {
  return `⚠️ ${message}`;
}
