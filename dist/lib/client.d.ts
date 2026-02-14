/**
 * Standalone API client for the Snake game.
 *
 * Framework-agnostic -- takes a server URL and auth token directly.
 * No OpenClaw dependencies.
 */
export interface ApiError extends Error {
    status: number;
    body: string;
}
export declare class SnakeClient {
    private backendUrl;
    private token;
    constructor(backendUrl: string, token: string | null);
    setToken(token: string | null): void;
    request(path: string, options?: RequestInit): Promise<any>;
    getGameState(): Promise<any>;
    getBalance(): Promise<number>;
    submitVote(direction: string, team: string, amount: number): Promise<any>;
    getRodeos(): Promise<any[]>;
    getUserStatus(): Promise<any>;
}
//# sourceMappingURL=client.d.ts.map