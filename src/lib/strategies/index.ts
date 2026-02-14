/**
 * Strategy Registry
 *
 * Registers all available strategies and provides a factory method.
 */

import { ExpectedValueStrategy } from './expected-value.js';
import { AggressiveStrategy } from './aggressive.js';
import { UnderdogStrategy } from './underdog.js';
import { ConservativeStrategy } from './conservative.js';
import { RandomStrategy } from './random.js';
import { BaseStrategy } from './base.js';

type StrategyConstructor = new (options?: Record<string, unknown>) => BaseStrategy;

// Registry of all available strategies
const STRATEGIES: Record<string, StrategyConstructor> = {
  'expected-value': ExpectedValueStrategy,
  'aggressive': AggressiveStrategy,
  'underdog': UnderdogStrategy,
  'conservative': ConservativeStrategy,
  'random': RandomStrategy,
};

// Aliases for convenience
const ALIASES: Record<string, string> = {
  'ev': 'expected-value',
  'agg': 'aggressive',
  'und': 'underdog',
  'con': 'conservative',
  'rand': 'random',
  'default': 'expected-value',
};

/**
 * Get a strategy instance by name
 */
export function getStrategy(name: string, options: Record<string, unknown> = {}): BaseStrategy {
  // Resolve alias
  const resolvedName = ALIASES[name] || name;

  const StrategyClass = STRATEGIES[resolvedName];
  if (!StrategyClass) {
    throw new Error(`Unknown strategy: ${name}. Available: ${listStrategies().join(', ')}`);
  }

  return new StrategyClass(options);
}

/**
 * List all available strategy names
 */
export function listStrategies(): string[] {
  return Object.keys(STRATEGIES);
}

interface StrategyInfo {
  name: string;
  description: string;
  aliases: string[];
}

/**
 * Get strategy info (name, description, aliases)
 */
export function getStrategyInfo(name: string): StrategyInfo | null {
  const resolvedName = ALIASES[name] || name;
  const StrategyClass = STRATEGIES[resolvedName];

  if (!StrategyClass) {
    return null;
  }

  // Create temp instance to get description
  const instance = new StrategyClass();

  // Find aliases for this strategy
  const aliases = Object.entries(ALIASES)
    .filter(([_, target]) => target === resolvedName)
    .map(([alias]) => alias);

  return {
    name: resolvedName,
    description: instance.description,
    aliases,
  };
}

/**
 * List all strategies with descriptions
 */
export function listStrategiesWithInfo(): StrategyInfo[] {
  return listStrategies().map(name => getStrategyInfo(name)!);
}

/**
 * Register a custom strategy
 */
export function registerStrategy(name: string, StrategyClass: StrategyConstructor): void {
  STRATEGIES[name] = StrategyClass;
}

export { BaseStrategy } from './base.js';
export type { VoteResult } from './base.js';
