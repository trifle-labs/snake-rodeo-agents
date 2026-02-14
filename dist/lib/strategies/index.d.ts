/**
 * Strategy Registry
 *
 * Registers all available strategies and provides a factory method.
 */
import { BaseStrategy } from './base.js';
type StrategyConstructor = new (options?: Record<string, any>) => BaseStrategy;
/**
 * Get a strategy instance by name
 */
export declare function getStrategy(name: string, options?: Record<string, any>): BaseStrategy;
/**
 * List all available strategy names
 */
export declare function listStrategies(): string[];
interface StrategyInfo {
    name: string;
    description: string;
    aliases: string[];
}
/**
 * Get strategy info (name, description, aliases)
 */
export declare function getStrategyInfo(name: string): StrategyInfo | null;
/**
 * List all strategies with descriptions
 */
export declare function listStrategiesWithInfo(): StrategyInfo[];
/**
 * Register a custom strategy
 */
export declare function registerStrategy(name: string, StrategyClass: StrategyConstructor): void;
export { BaseStrategy } from './base.js';
export type { VoteResult } from './base.js';
//# sourceMappingURL=index.d.ts.map