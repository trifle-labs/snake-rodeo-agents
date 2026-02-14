/**
 * Wallet-based authentication for the Snake agent.
 *
 * Generates a random Ethereum wallet and authenticates via SIWE
 * (Sign In With Ethereum) against the trifle-bot backend.
 * No browser, no OpenClaw -- fully standalone.
 */
import type { PrivateKeyAccount } from 'viem/accounts';
export interface AuthResult {
    token: string;
    address: string;
    privateKey: `0x${string}`;
}
export interface AuthOptions {
    privateKey?: `0x${string}`;
    chainId?: number;
    domain?: string;
    uri?: string;
}
export interface AuthUser {
    id: string;
    username: string;
    [key: string]: any;
}
/**
 * Generate a new random wallet and authenticate against the backend.
 * Returns { token, address, privateKey } so the caller can persist them.
 */
export declare function createAndAuthenticate(backendUrl: string, options?: AuthOptions): Promise<AuthResult>;
/**
 * Authenticate an existing viem account against the backend.
 */
export declare function authenticateWallet(backendUrl: string, account: PrivateKeyAccount, options?: AuthOptions): Promise<string>;
/**
 * Re-authenticate using a saved private key.
 */
export declare function reauthenticate(backendUrl: string, privateKey: `0x${string}`, options?: AuthOptions): Promise<AuthResult>;
/**
 * Check if a token is still valid by hitting /auth/status
 */
export declare function checkToken(backendUrl: string, token: string): Promise<AuthUser | null>;
//# sourceMappingURL=auth.d.ts.map