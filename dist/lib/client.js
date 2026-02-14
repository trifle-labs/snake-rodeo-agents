/**
 * Standalone API client for the Snake game.
 *
 * Framework-agnostic -- takes a server URL and auth token directly.
 * No OpenClaw dependencies.
 */
export class SnakeClient {
    backendUrl;
    token;
    constructor(backendUrl, token) {
        this.backendUrl = backendUrl;
        this.token = token;
    }
    setToken(token) {
        this.token = token;
    }
    async request(path, options = {}) {
        const url = `${this.backendUrl}${path}`;
        const res = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Origin': 'https://trifle.life',
                'Referer': 'https://trifle.life/',
                ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {}),
                ...options.headers,
            },
        });
        if (!res.ok) {
            const text = await res.text();
            const error = new Error(`API ${res.status}: ${text}`);
            error.status = res.status;
            error.body = text;
            throw error;
        }
        return res.json();
    }
    async getGameState() {
        const result = await this.request('/snake/state');
        return result.gameState || result;
    }
    async getBalance() {
        try {
            const result = await this.request('/balls');
            return result.balls ?? result.totalBalls ?? 0;
        }
        catch {
            return 0;
        }
    }
    async submitVote(direction, team, amount) {
        return this.request('/snake/vote', {
            method: 'POST',
            body: JSON.stringify({ direction, team, amount }),
        });
    }
    async getRodeos() {
        const result = await this.request('/snake/rodeos');
        return Array.isArray(result) ? result : result.rodeos || [];
    }
    async getUserStatus() {
        return this.request('/auth/status');
    }
}
//# sourceMappingURL=client.js.map