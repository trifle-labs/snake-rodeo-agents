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
export declare class TelegramLogger {
    private botToken;
    private chatId;
    constructor(config: TelegramConfig);
    /** Send an HTML-formatted message. Returns true on success. */
    send(text: string): Promise<boolean>;
}
export declare function formatVote(round: number, direction: string, team: ParsedTeam, amount: number, balance: number, teams: ParsedTeam[], reason?: string): string;
export declare function formatGameEnd(winner: ParsedTeam, didWin: boolean): string;
export declare function formatTeamSwitch(fromTeam: string | null, toTeam: ParsedTeam, reason: string): string;
export declare function formatError(message: string): string;
export declare function formatWarning(message: string): string;
//# sourceMappingURL=telegram.d.ts.map