#!/usr/bin/env node
/**
 * Tournament Simulator CLI
 *
 * Runs offline tournaments between AI strategies at high speed.
 * Uses a seeded PRNG for fully reproducible results.
 *
 * Usage:
 *   node dist/bin/simulate.js [options] [agents]
 *
 * Examples:
 *   node dist/bin/simulate.js ev,aggressive --games 100 --seed 42
 *   node dist/bin/simulate.js ev,ev:contrarian --config small --json
 */
import { parseArgs } from 'util';
import { getStrategy, listStrategiesWithInfo } from '../lib/strategies/index.js';
import { SimAgent, runTournament, RODEO_CYCLES, } from '../lib/simulator.js';
// ── CLI argument parsing ────────────────────────────────────────────
const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
        games: { type: 'string', short: 'g', default: '100' },
        config: { type: 'string', short: 'c', default: 'all' },
        seed: { type: 'string', short: 's' },
        verbose: { type: 'boolean', short: 'v', default: false },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
    },
});
if (values.help) {
    printHelp();
    process.exit(0);
}
function parseAgentSpec(spec) {
    const [name, ...optParts] = spec.split(':');
    const options = {};
    for (const part of optParts) {
        // key=value or just key (boolean true)
        const eqIdx = part.indexOf('=');
        if (eqIdx !== -1) {
            options[part.slice(0, eqIdx)] = part.slice(eqIdx + 1);
        }
        else {
            options[part] = true;
        }
    }
    return { label: spec, strategyName: name, options };
}
function createAgentsFromSpecs(specs, balance) {
    return specs.map((spec, i) => {
        const strategy = getStrategy(spec.strategyName, spec.options);
        return new SimAgent(`agent-${i}`, `${spec.label}#${i}`, strategy, balance);
    });
}
// ── Resolve configs ─────────────────────────────────────────────────
function resolveConfigs(configName) {
    if (configName === 'all')
        return RODEO_CYCLES;
    const match = RODEO_CYCLES.find(c => c.name.toLowerCase() === configName.toLowerCase());
    if (!match) {
        console.error(`Unknown config: ${configName}. Available: ${RODEO_CYCLES.map(c => c.name.toLowerCase()).join(', ')}, all`);
        process.exit(1);
    }
    return [match];
}
// ── Output formatting ───────────────────────────────────────────────
function printHelp() {
    console.log(`
Tournament Simulator — pit strategies against each other offline

Usage: simulate [options] [agents]

Arguments:
  agents              Comma-separated strategy specs (default: ev,aggressive)
                      Format: strategy[:option[:option]]
                      Example: ev, ev:contrarian, aggressive

Options:
  -g, --games N       Games per config (default: 100)
  -c, --config NAME   small|medium|large|all (default: all)
  -s, --seed N        RNG seed for reproducibility
  -v, --verbose       Print per-round details
      --json          Machine-readable JSON output
  -h, --help          Show this help

Available strategies:`);
    for (const info of listStrategiesWithInfo()) {
        const aliases = info.aliases.length ? ` (${info.aliases.join(', ')})` : '';
        console.log(`  ${info.name.padEnd(20)} ${info.description}${aliases}`);
    }
    console.log(`
Examples:
  simulate ev,aggressive --games 50 --seed 42
  simulate ev,ev:contrarian,random --config small --json
  simulate ev,agg,con,rand --games 200`);
}
function aggregateByStrategy(results) {
    const groups = new Map();
    for (const stat of results.agentStats || []) {
        const label = stat.name.replace(/#\d+$/, '');
        const existing = groups.get(label) || { wins: 0, games: 0, spent: 0, earned: 0 };
        existing.wins += stat.wins;
        existing.games += stat.gamesPlayed;
        existing.spent += stat.totalSpent || 0;
        existing.earned += stat.totalEarned || 0;
        groups.set(label, existing);
    }
    return [...groups.entries()].map(([label, { wins, games, spent, earned }]) => ({
        label,
        wins,
        games,
        winRate: games > 0 ? wins / games : 0,
        totalSpent: spent,
        totalEarned: earned,
        profit: earned - spent,
        roi: spent > 0 ? (earned - spent) / spent : 0,
    }));
}
function printResults(results, specs) {
    const stratGroups = aggregateByStrategy(results);
    console.log('\n═══════════════════════════════════════════');
    console.log('  Tournament Results');
    console.log('═══════════════════════════════════════════\n');
    console.log(`  Games: ${results.totalGames}  |  Avg rounds: ${results.avgRounds.toFixed(1)}  |  Seed: ${results.seed}\n`);
    // Per-config breakdown
    for (const cr of results.configResults) {
        const winParts = Object.entries(cr.wins)
            .filter(([, w]) => w > 0)
            .map(([t, w]) => `${t}:${w}`)
            .join(' ');
        const noWin = cr.noWinner > 0 ? `  (${cr.noWinner} draws)` : '';
        console.log(`  ${cr.config.padEnd(8)} ${cr.games} games, avg ${cr.avgRounds.toFixed(1)} rounds — wins: ${winParts}${noWin}`);
    }
    // Per-strategy summary
    console.log('\n  Strategy Performance:');
    console.log('  ' + '─'.repeat(70));
    console.log(`  ${'Strategy'.padEnd(22)} ${'Wins'.padStart(10)}  ${'Win%'.padStart(6)}  ${'Spent'.padStart(7)}  ${'Earned'.padStart(7)}  ${'ROI'.padStart(7)}`);
    console.log('  ' + '─'.repeat(70));
    // Sort by ROI descending
    stratGroups.sort((a, b) => b.roi - a.roi);
    for (const sg of stratGroups) {
        const pct = (sg.winRate * 100).toFixed(1);
        const roiPct = (sg.roi * 100).toFixed(1);
        const bar = '█'.repeat(Math.max(0, Math.round(sg.roi * 20)));
        console.log(`  ${sg.label.padEnd(22)} ${String(sg.wins).padStart(4)}/${sg.games}  ${pct.padStart(5)}%  ${String(Math.round(sg.totalSpent)).padStart(7)}  ${String(Math.round(sg.totalEarned)).padStart(7)}  ${roiPct.padStart(6)}%  ${bar}`);
    }
    // Head-to-head when exactly 2 strategy groups
    if (stratGroups.length === 2) {
        const [a, b] = stratGroups;
        console.log('\n  Head-to-Head:');
        console.log('  ' + '─'.repeat(50));
        const draws = results.totalGames - a.wins - b.wins;
        console.log(`  ${a.label}: ${a.wins}  vs  ${b.label}: ${b.wins}` + (draws > 0 ? `  (${draws} draws)` : ''));
        if (a.wins > b.wins) {
            console.log(`  → ${a.label} wins by ${((a.winRate - b.winRate) * 100).toFixed(1)} percentage points`);
        }
        else if (b.wins > a.wins) {
            console.log(`  → ${b.label} wins by ${((b.winRate - a.winRate) * 100).toFixed(1)} percentage points`);
        }
        else {
            console.log(`  → Dead even!`);
        }
    }
    console.log(`\n  Seed: ${results.seed} (rerun with --seed ${results.seed} to reproduce)\n`);
}
// ── Main ────────────────────────────────────────────────────────────
const agentInput = positionals[0] || 'ev,aggressive';
const specs = agentInput.split(',').map(s => parseAgentSpec(s.trim()));
const numGames = parseInt(values.games, 10);
const configs = resolveConfigs(values.config);
const seed = values.seed ? parseInt(values.seed, 10) : undefined;
// Create agents
const agents = createAgentsFromSpecs(specs, 100);
if (!values.json) {
    console.log(`Running tournament: ${specs.map(s => s.label).join(' vs ')}`);
    console.log(`  ${numGames} games × ${configs.length} config(s)${seed != null ? ` | seed: ${seed}` : ''}`);
}
const results = runTournament(agents, configs, numGames, {
    verbose: values.verbose,
    seed,
});
if (values.json) {
    const jsonOutput = {
        ...results,
        strategies: aggregateByStrategy(results),
        agents: specs.map(s => s.label),
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
}
else {
    printResults(results, specs);
}
//# sourceMappingURL=simulate.js.map