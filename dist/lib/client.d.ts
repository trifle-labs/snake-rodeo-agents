/**
 * Standalone API client for the Snake game.
 *
 * Framework-agnostic -- takes a server URL and auth token directly.
 * No OpenClaw dependencies.
 */
import type { GameState } from './game-state.js';
export interface ApiError extends Error {
    status: number;
    body: string;
}
export declare class SnakeClient {
    private backendUrl;
    private token;
    constructor(backendUrl: string, token: string | null);
    setToken(token: string | null): void;
    /** Low-level HTTP request. Returns parsed JSON. `any` is intentional at the HTTP boundary. */
    request(path: string, options?: RequestInit): Promise<any>;
    getGameState(): Promise<GameState>;
    getBalance(): Promise<number>;
    submitVote(direction: string, team: string, amount: number): Promise<unknown>;
    getRodeos(): Promise<unknown[]>;
    getUserStatus(): Promise<unknown>;
}
//# sourceMappingURL=client.d.ts.map