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

export class SnakeClient {
  private backendUrl: string;
  private token: string | null;

  constructor(backendUrl: string, token: string | null) {
    this.backendUrl = backendUrl;
    this.token = token;
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  /** Low-level HTTP request. Returns parsed JSON. `any` is intentional at the HTTP boundary. */
  async request(path: string, options: RequestInit = {}): Promise<any> {  // eslint-disable-line @typescript-eslint/no-explicit-any
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
      const error = new Error(`API ${res.status}: ${text}`) as ApiError;
      error.status = res.status;
      error.body = text;
      throw error;
    }

    return res.json();
  }

  async getGameState(): Promise<GameState> {
    const result = await this.request('/snake/state');
    return result.gameState || result;
  }

  async getBalance(): Promise<number> {
    try {
      const result = await this.request('/balls');
      return result.balls ?? result.totalBalls ?? 0;
    } catch {
      return 0;
    }
  }

  async submitVote(direction: string, team: string, amount: number): Promise<unknown> {
    return this.request('/snake/vote', {
      method: 'POST',
      body: JSON.stringify({ direction, team, amount }),
    });
  }

  async getRodeos(): Promise<unknown[]> {
    const result = await this.request('/snake/rodeos');
    return Array.isArray(result) ? result : result.rodeos || [];
  }

  async getUserStatus(): Promise<unknown> {
    return this.request('/auth/status');
  }
}
