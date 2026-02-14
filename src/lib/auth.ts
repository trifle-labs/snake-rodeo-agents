/**
 * Wallet-based authentication for the Snake agent.
 *
 * Generates a random Ethereum wallet and authenticates via SIWE
 * (Sign In With Ethereum) against the trifle-bot backend.
 * No browser, no OpenClaw -- fully standalone.
 */

import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
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
export async function createAndAuthenticate(
  backendUrl: string,
  options: AuthOptions = {},
): Promise<AuthResult> {
  const privateKey = options.privateKey || generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const address = account.address.toLowerCase();

  const token = await authenticateWallet(backendUrl, account, options);

  return { token, address, privateKey };
}

/**
 * Authenticate an existing viem account against the backend.
 */
export async function authenticateWallet(
  backendUrl: string,
  account: PrivateKeyAccount,
  options: AuthOptions = {},
): Promise<string> {
  const address = account.address.toLowerCase();
  const chainId = options.chainId || 1; // mainnet by default
  const domain = options.domain || 'trifle.life';
  const uri = options.uri || 'https://trifle.life';

  // Step 1: Get nonce
  const nonceRes = await fetch(`${backendUrl}/auth/wallet/nonce`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': uri,
      'Referer': `${uri}/`,
    },
  });

  if (!nonceRes.ok) {
    const text = await nonceRes.text();
    throw new Error(`Failed to get nonce: ${nonceRes.status} ${text}`);
  }

  const { nonce } = await nonceRes.json() as { nonce: string };

  // Step 2: Create SIWE message
  const message = createSiweMessage({
    domain,
    address: account.address, // use checksummed address for SIWE
    statement: 'Sign this message to prove you own this wallet (at no cost to you).',
    uri,
    version: '1',
    chainId,
    nonce,
  });

  // Step 3: Sign message
  const signature = await account.signMessage({ message });

  // Step 4: Verify and get JWT
  const verifyRes = await fetch(`${backendUrl}/auth/wallet/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': uri,
      'Referer': `${uri}/`,
    },
    body: JSON.stringify({ signature, message, chainId }),
  });

  if (!verifyRes.ok) {
    const text = await verifyRes.text();
    throw new Error(`Failed to verify wallet: ${verifyRes.status} ${text}`);
  }

  const { token } = await verifyRes.json() as { token: string };
  if (!token) {
    throw new Error('No token returned from verify endpoint');
  }

  return token;
}

/**
 * Re-authenticate using a saved private key.
 */
export async function reauthenticate(
  backendUrl: string,
  privateKey: `0x${string}`,
  options: AuthOptions = {},
): Promise<AuthResult> {
  const account = privateKeyToAccount(privateKey);
  const token = await authenticateWallet(backendUrl, account, options);
  return { token, address: account.address.toLowerCase(), privateKey };
}

/**
 * Check if a token is still valid by hitting /auth/status
 */
export async function checkToken(
  backendUrl: string,
  token: string,
): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${backendUrl}/auth/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://trifle.life',
        'Referer': 'https://trifle.life/',
      },
    });
    if (!res.ok) return null;
    const data = await res.json() as { user?: AuthUser };
    return data.user || null;
  } catch {
    return null;
  }
}
