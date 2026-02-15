/**
 * Local Snake Game Simulator
 *
 * Replicates the trifle-bot server game logic for offline testing.
 * Multiple AI agents compete by voting on directions each round.
 * The simulator resolves votes and advances the game state.
 */
import { ALL_DIRECTION_OFFSETS, isInBounds, getValidDirections, parseGameState, } from './game-state.js';
/**
 * mulberry32 — fast, high-quality 32-bit PRNG.
 * Returns a function producing values in [0, 1).
 */
function mulberry32(seed) {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/**
 * Create a seeded RNG. If no seed is provided one is auto-generated.
 */
export function createRNG(seed) {
    const s = seed ?? ((Math.random() * 0xffffffff) >>> 0);
    return { rng: mulberry32(s), seed: s };
}
/**
 * Fisher-Yates shuffle (in-place, returns same array).
 */
export function shuffleArray(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0;
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
const TEAM_CONFIG = [
    { id: 'A', name: 'Blue', color: '#0066FF', emoji: '\u{1FAD0}' },
    { id: 'B', name: 'Red', color: '#FF0000', emoji: '\u{1F34E}' },
    { id: 'C', name: 'Yellow', color: '#FFDD00', emoji: '\u{1F34C}' },
    { id: 'D', name: 'Green', color: '#00CC00', emoji: '\u{1F95D}' },
    { id: 'E', name: 'Purple', color: '#9900FF', emoji: '\u{1F347}' },
    { id: 'F', name: 'Orange', color: '#FF6600', emoji: '\u{1F34A}' },
];
export const RODEO_CYCLES = [
    {
        name: 'Small',
        numberOfTeams: 2,
        hexRadius: 2,
        fruitsPerTeam: 1,
        fruitsToWin: 3,
        startingBalance: 5,
        initialMinBid: 1,
        initialSnakeLength: 1,
        respawn: true,
        simpleBid: true,
    },
    {
        name: 'Medium',
        numberOfTeams: 3,
        hexRadius: 3,
        fruitsPerTeam: 2,
        fruitsToWin: 3,
        startingBalance: 10,
        initialMinBid: 1,
        initialSnakeLength: 1,
        respawn: true,
        simpleBid: true,
    },
    {
        name: 'Large',
        numberOfTeams: 4,
        hexRadius: 4,
        fruitsPerTeam: 3,
        fruitsToWin: 4,
        startingBalance: 15,
        initialMinBid: 1,
        initialSnakeLength: 1,
        respawn: true,
        simpleBid: true,
    },
    {
        name: 'Small Cartesian',
        gridType: 'cartesian',
        numberOfTeams: 2,
        hexRadius: 3,
        fruitsPerTeam: 1,
        fruitsToWin: 3,
        startingBalance: 5,
        initialMinBid: 1,
        initialSnakeLength: 1,
        respawn: true,
        simpleBid: true,
    },
    {
        name: 'Medium Cartesian',
        gridType: 'cartesian',
        numberOfTeams: 3,
        hexRadius: 4,
        fruitsPerTeam: 2,
        fruitsToWin: 3,
        startingBalance: 10,
        initialMinBid: 1,
        initialSnakeLength: 1,
        respawn: true,
        simpleBid: true,
    },
    {
        name: 'Large Cartesian',
        gridType: 'cartesian',
        numberOfTeams: 4,
        hexRadius: 5,
        fruitsPerTeam: 3,
        fruitsToWin: 4,
        startingBalance: 15,
        initialMinBid: 1,
        initialSnakeLength: 1,
        respawn: true,
        simpleBid: true,
    },
];
/**
 * Generate a random fruit position avoiding snake body and existing fruits
 */
function generateFruitPosition(snakeBody, existingFruits, radius, rng = Math.random, gridType = 'hexagonal') {
    let minDistFromCenter;
    if (radius === 2)
        minDistFromCenter = 1;
    else if (radius === 3)
        minDistFromCenter = 2;
    else
        minDistFromCenter = Math.floor(radius * 0.5);
    if (gridType === 'cartesian') {
        // Cartesian: random q,r in square bounds
        for (let attempts = 0; attempts < 1000; attempts++) {
            const q = Math.floor(rng() * (2 * radius + 1)) - radius;
            const r = Math.floor(rng() * (2 * radius + 1)) - radius;
            const dist = Math.abs(q) + Math.abs(r);
            if (!isInBounds(q, r, radius, 'cartesian'))
                continue;
            if (dist < minDistFromCenter)
                continue;
            if (snakeBody.some(seg => seg.q === q && seg.r === r))
                continue;
            if (existingFruits.some(f => f.q === q && f.r === r))
                continue;
            return { q, r };
        }
    }
    else {
        // Hexagonal: angle-based placement
        for (let attempts = 0; attempts < 1000; attempts++) {
            const angle = rng() * 2 * Math.PI;
            const distance = minDistFromCenter + rng() * (radius - minDistFromCenter);
            const q = Math.round(distance * Math.cos(angle));
            const r = Math.round(distance * Math.sin(angle) - q / 2);
            if (!isInBounds(q, r, radius))
                continue;
            if (snakeBody.some(seg => seg.q === q && seg.r === r))
                continue;
            if (existingFruits.some(f => f.q === q && f.r === r))
                continue;
            return { q, r };
        }
    }
    // Fallback: find any valid position
    for (let q = -radius; q <= radius; q++) {
        for (let r = -radius; r <= radius; r++) {
            if (!isInBounds(q, r, radius, gridType))
                continue;
            if (snakeBody.some(seg => seg.q === q && seg.r === r))
                continue;
            if (existingFruits.some(f => f.q === q && f.r === r))
                continue;
            return { q, r };
        }
    }
    return { q: 0, r: 0 };
}
/**
 * Create initial game state for a simulation
 */
export function createGameState(config, rng = Math.random) {
    const teams = TEAM_CONFIG.slice(0, config.numberOfTeams);
    const radius = config.hexRadius;
    const gridType = config.gridType || 'hexagonal';
    const initialDir = gridType === 'cartesian' ? 'up' : 'n';
    // Snake starts at center
    const body = [{ q: 0, r: 0 }];
    // Generate fruits for each team
    const apples = {};
    const allFruits = [];
    for (const team of teams) {
        apples[team.id] = [];
        for (let i = 0; i < config.fruitsPerTeam; i++) {
            const fruit = generateFruitPosition(body, allFruits, radius, rng, gridType);
            apples[team.id].push(fruit);
            allFruits.push(fruit);
        }
    }
    const fruitScores = {};
    const teamPools = {};
    for (const team of teams) {
        fruitScores[team.id] = 0;
        teamPools[team.id] = 0;
    }
    return {
        id: 1,
        snake: {
            body,
            currentDirection: initialDir,
            currentWinningTeam: null,
            currentWinningUser: null,
        },
        gridSize: { type: gridType, radius },
        apples,
        eatenFruits: [],
        fruitScores,
        teamPools,
        votes: {},
        gameActive: true,
        winner: null,
        prizePool: config.startingBalance,
        nextMoveTime: Date.now() + 10000,
        round: 0,
        countdown: 10,
        totalRoundTime: 10,
        minBid: config.initialMinBid || 1,
        nonce: 0,
        config: {
            gridType,
            hexRadius: radius,
            roundDurationSeconds: 10,
            newGameDelaySeconds: 20,
            extensionPeriodSeconds: 5,
            fruitsPerTeam: config.fruitsPerTeam,
            fruitsToWin: config.fruitsToWin,
            initialMinBid: config.initialMinBid || 1,
            startingBalance: config.startingBalance,
            numberOfTeams: config.numberOfTeams,
            auctionMode: 'all-pay-auction',
            respawn: config.respawn !== false,
            collision: false,
            simpleBid: true,
            initialSnakeLength: config.initialSnakeLength || 1,
            grow: false,
        },
        teams,
    };
}
/**
 * Move the snake in the given direction and process the game state.
 * Returns the updated game state and info about what happened.
 */
export function advanceRound(gameState, direction, winningTeamId, rng = Math.random) {
    const head = gameState.snake.body[0];
    const offset = ALL_DIRECTION_OFFSETS[direction];
    const newHead = {
        q: head.q + offset.q,
        r: head.r + offset.r,
    };
    const radius = gameState.gridSize.radius;
    const gridType = (gameState.gridSize.type || 'hexagonal');
    // Check collision (boundary or self)
    if (!isInBounds(newHead.q, newHead.r, radius, gridType)) {
        // Invalid move - game over or skip (server prevents this)
        return { gameState, event: 'collision_boundary' };
    }
    const bodyWithoutTail = gameState.snake.body.slice(0, -1);
    if (bodyWithoutTail.some(seg => seg.q === newHead.q && seg.r === newHead.r)) {
        return { gameState, event: 'collision_self' };
    }
    // Move the snake
    const newBody = [newHead, ...gameState.snake.body];
    // Check fruit collision
    let ateFruit = null;
    let ateTeam = null;
    for (const [teamId, fruits] of Object.entries(gameState.apples)) {
        for (let i = 0; i < fruits.length; i++) {
            if (fruits[i].q === newHead.q && fruits[i].r === newHead.r) {
                ateFruit = fruits[i];
                ateTeam = teamId;
                break;
            }
        }
        if (ateFruit)
            break;
    }
    const newApples = { ...gameState.apples };
    const newFruitScores = { ...gameState.fruitScores };
    const newEatenFruits = [...gameState.eatenFruits];
    if (ateFruit) {
        // Remove the eaten fruit
        newApples[ateTeam] = newApples[ateTeam].filter(f => !(f.q === ateFruit.q && f.r === ateFruit.r));
        // Credit to the winning team (the team that controlled the snake this round)
        if (winningTeamId) {
            newFruitScores[winningTeamId] = (newFruitScores[winningTeamId] || 0) + 1;
        }
        newEatenFruits.push({
            q: ateFruit.q,
            r: ateFruit.r,
            team: winningTeamId || ateTeam,
            emoji: TEAM_CONFIG.find(t => t.id === ateTeam)?.emoji || '?',
            order: newEatenFruits.length + 1,
        });
        // Respawn fruit if enabled
        if (gameState.config.respawn) {
            const allFruits = Object.values(newApples).flat();
            const newFruit = generateFruitPosition(newBody, allFruits, radius, rng, gridType);
            newApples[ateTeam] = [...newApples[ateTeam], newFruit];
        }
    }
    // Snake growth: remove tail unless fruit was eaten (classic snake)
    const finalBody = ateFruit ? newBody : newBody.slice(0, -1);
    // Check win condition
    let winner = null;
    for (const [teamId, score] of Object.entries(newFruitScores)) {
        if (score >= gameState.config.fruitsToWin) {
            winner = teamId;
            break;
        }
    }
    // Also handle initial growth (first 2 moves grow to length 3)
    let growthBody = finalBody;
    if (!ateFruit && gameState.snake.body.length < 3 && gameState.round < 2) {
        growthBody = newBody; // keep the tail for initial growth
    }
    const newState = {
        ...gameState,
        snake: {
            body: growthBody,
            currentDirection: direction,
            currentWinningTeam: winningTeamId,
            currentWinningUser: null,
        },
        apples: newApples,
        eatenFruits: newEatenFruits,
        fruitScores: newFruitScores,
        round: gameState.round + 1,
        winner,
        gameActive: winner === null,
        nonce: gameState.nonce + 1,
    };
    return {
        gameState: newState,
        event: ateFruit ? 'ate_fruit' : 'moved',
        ateFruit,
        ateTeam,
        winner,
    };
}
/**
 * A simulated agent/player that uses a strategy to make decisions
 */
export class SimAgent {
    id;
    name;
    strategy;
    balance;
    currentTeam;
    totalSpent;
    totalEarned;
    /** Cumulative spending across all games (persists through reset) */
    cumulativeSpent;
    /** Cumulative earnings across all games (persists through reset) */
    cumulativeEarned;
    votesPlaced;
    wins;
    gamesPlayed;
    fruitsCollected;
    constructor(id, name, strategy, balance = 100) {
        this.id = id;
        this.name = name;
        this.strategy = strategy;
        this.balance = balance;
        this.currentTeam = null;
        this.totalSpent = 0;
        this.totalEarned = 0;
        this.cumulativeSpent = 0;
        this.cumulativeEarned = 0;
        this.votesPlaced = 0;
        this.wins = 0;
        this.gamesPlayed = 0;
        this.fruitsCollected = 0;
    }
    reset(balance = 100) {
        this.balance = balance;
        this.currentTeam = null;
        this.totalSpent = 0;
        this.totalEarned = 0;
        this.votesPlaced = 0;
    }
    // Per-round tracking (reset each round by simulateGame)
    roundSpend = 0;
    roundVoteCount = 0;
    /** Max fraction of balance to spend in a single round */
    maxRoundBudgetPct = 0.2;
    computeVote(gameState) {
        const parsed = parseGameState(gameState);
        if (!parsed || !parsed.active)
            return null;
        const roundBudget = this.balance * this.maxRoundBudgetPct;
        const state = {
            currentTeam: this.currentTeam,
            roundSpend: this.roundSpend,
            roundVoteCount: this.roundVoteCount,
            roundBudgetRemaining: Math.max(0, roundBudget - this.roundSpend),
            lastRound: -1,
            gamesPlayed: this.gamesPlayed,
            votesPlaced: this.votesPlaced,
            wins: this.wins,
        };
        const result = this.strategy.computeVote(parsed, this.balance, state);
        if (!result || 'skip' in result)
            return null;
        this.currentTeam = result.team.id;
        this.balance -= result.amount;
        this.totalSpent += result.amount;
        this.votesPlaced++;
        this.roundSpend += result.amount;
        this.roundVoteCount++;
        return result;
    }
    /**
     * Attempt a counter-bid after being overridden.
     * Returns a VoteAction if the agent wants to counter, null otherwise.
     */
    computeCounterBid(gameState, previousVote) {
        if (!this.strategy.shouldCounterBid)
            return null;
        const parsed = parseGameState(gameState);
        if (!parsed || !parsed.active)
            return null;
        if (this.balance < parsed.minBid)
            return null;
        const roundBudget = this.balance * this.maxRoundBudgetPct;
        const state = {
            currentTeam: this.currentTeam,
            roundSpend: this.roundSpend,
            roundVoteCount: this.roundVoteCount,
            roundBudgetRemaining: Math.max(0, roundBudget - this.roundSpend),
            lastRound: -1,
            gamesPlayed: this.gamesPlayed,
            votesPlaced: this.votesPlaced,
            wins: this.wins,
        };
        const result = this.strategy.shouldCounterBid(parsed, this.balance, state, previousVote);
        if (!result || 'skip' in result)
            return null;
        this.currentTeam = result.team.id;
        this.balance -= result.amount;
        this.totalSpent += result.amount;
        this.votesPlaced++;
        this.roundSpend += result.amount;
        this.roundVoteCount++;
        return result;
    }
    /** Reset per-round counters (called at start of each round) */
    resetRound() {
        this.roundSpend = 0;
        this.roundVoteCount = 0;
    }
}
/**
 * Run a single simulated game with multiple agents.
 *
 * Each round:
 * 1. Reset per-round budgets, shuffle agent order
 * 2. All agents compute initial votes
 * 3. "Last vote wins" — reveal the winning direction
 * 4. Counter-bidding loop: agents whose direction was overridden can
 *    counter-bid. Each counter-bid doubles minBid (extension mechanic).
 *    Loop until no one counters or max extensions reached.
 * 5. Snake moves in the final winning direction
 * 6. Repeat until a team wins or max rounds reached
 */
export function simulateGame(agents, config, options = {}) {
    const maxRounds = options.maxRounds || 200;
    const verbose = options.verbose || false;
    const maxExtensions = options.maxExtensions ?? 5;
    const { rng, seed } = createRNG(options.seed);
    let gameState = createGameState(config, rng);
    // Reset agents
    for (const agent of agents) {
        agent.reset(config.startingBalance * 2);
        agent.gamesPlayed++;
    }
    const roundLog = [];
    const agentOrder = [...agents];
    for (let round = 0; round < maxRounds; round++) {
        if (!gameState.gameActive)
            break;
        // Reset per-round budget tracking
        for (const agent of agents)
            agent.resetRound();
        // Shuffle agent order for fairness
        shuffleArray(agentOrder, rng);
        // === Phase 1: Initial votes ===
        const savedRandom = Math.random;
        Math.random = rng;
        const votes = [];
        try {
            for (const agent of agentOrder) {
                const vote = agent.computeVote(gameState);
                if (vote) {
                    votes.push({ agent, vote });
                }
            }
        }
        finally {
            Math.random = savedRandom;
        }
        if (votes.length === 0) {
            // No votes — snake continues in current direction
            const validDirs = getValidDirections(gameState);
            if (validDirs.length === 0) {
                if (verbose)
                    console.log(`Round ${round}: Dead end!`);
                break;
            }
            const dir = validDirs.includes(gameState.snake.currentDirection)
                ? gameState.snake.currentDirection
                : validDirs[0];
            const result = advanceRound(gameState, dir, null, rng);
            gameState = result.gameState;
            continue;
        }
        // === Phase 2: Counter-bidding loop ===
        // The last vote determines direction + team. Agents whose preferred
        // direction was overridden can counter-bid (at escalating cost).
        let currentMinBid = gameState.minBid;
        let extensions = 0;
        let lastVote = votes[votes.length - 1];
        for (let ext = 0; ext < maxExtensions; ext++) {
            // Double minBid for the counter-bid (extension penalty)
            const counterBidCost = currentMinBid * 2;
            // Update gameState so strategies see the current extensions + minBid
            gameState = {
                ...gameState,
                minBid: counterBidCost,
                snake: {
                    ...gameState.snake,
                    currentDirection: lastVote.vote.direction,
                    currentWinningTeam: lastVote.vote.team.id,
                },
            };
            // Find agents whose direction was overridden
            const overridden = votes.filter(v => v.agent !== lastVote.agent &&
                v.vote.direction !== lastVote.vote.direction);
            if (overridden.length === 0)
                break;
            // Shuffle overridden agents for fairness, let them counter-bid
            const counterOrder = [...overridden];
            shuffleArray(counterOrder, rng);
            let anyCountered = false;
            Math.random = rng;
            try {
                for (const { agent, vote: prevVote } of counterOrder) {
                    const counter = agent.computeCounterBid(gameState, prevVote);
                    if (counter) {
                        votes.push({ agent, vote: counter });
                        lastVote = { agent, vote: counter };
                        anyCountered = true;
                    }
                }
            }
            finally {
                Math.random = savedRandom;
            }
            if (!anyCountered)
                break;
            extensions++;
            currentMinBid = counterBidCost;
        }
        // Restore original minBid for next round
        gameState = { ...gameState, minBid: config.initialMinBid || 1 };
        // Final winner is the last vote after all counter-bidding
        const direction = lastVote.vote.direction;
        const winningTeam = lastVote.vote.team.id;
        // Record team pool contributions for ALL votes (initial + counters)
        for (const { vote } of votes) {
            gameState.teamPools[vote.team.id] = (gameState.teamPools[vote.team.id] || 0) + vote.amount;
            gameState.prizePool += vote.amount;
        }
        // Validate direction
        const validDirs = getValidDirections(gameState);
        let actualDir = direction;
        if (!validDirs.includes(direction)) {
            actualDir = validDirs[0];
            if (!actualDir)
                break;
        }
        const result = advanceRound(gameState, actualDir, winningTeam, rng);
        if (verbose) {
            const extStr = extensions > 0 ? ` (${extensions} ext)` : '';
            if (result.ateFruit) {
                console.log(`Round ${round}: ${winningTeam} ate fruit!${extStr} Scores: ${JSON.stringify(result.gameState.fruitScores)}`);
            }
            else if (extensions > 0) {
                console.log(`Round ${round}: ${actualDir} → ${winningTeam}${extStr}`);
            }
        }
        roundLog.push({
            round,
            direction: actualDir,
            winningTeam,
            event: result.event,
            votes: votes.map(v => ({
                agent: v.agent.name,
                dir: v.vote.direction,
                team: v.vote.team.id,
            })),
        });
        gameState = result.gameState;
        if (result.winner) {
            // Calculate payouts: proportional to votes placed on winning team.
            // The real server pays per-vote-count, not equal split.
            // Agent with 10 votes gets 10 shares, agent with 5 gets 5.
            const winningAgents = agents.filter(a => a.currentTeam === result.winner);
            const totalWinningVotes = winningAgents.reduce((sum, a) => sum + a.votesPlaced, 0);
            for (const agent of agents) {
                if (agent.currentTeam === result.winner) {
                    agent.wins++;
                    if (totalWinningVotes > 0) {
                        const share = agent.votesPlaced / totalWinningVotes;
                        agent.totalEarned += gameState.prizePool * share;
                    }
                }
            }
            if (verbose) {
                console.log(`Game over! Winner: ${result.winner} in ${round + 1} rounds (pool: ${gameState.prizePool}, ${totalWinningVotes} votes from ${winningAgents.length} agents)`);
                console.log(`Final scores: ${JSON.stringify(gameState.fruitScores)}`);
            }
            break;
        }
    }
    // Accumulate per-game totals into cumulative trackers
    for (const agent of agents) {
        agent.cumulativeSpent += agent.totalSpent;
        agent.cumulativeEarned += agent.totalEarned;
    }
    return {
        gameState,
        winner: gameState.winner,
        rounds: gameState.round,
        fruitScores: { ...gameState.fruitScores },
        roundLog,
        seed,
    };
}
/**
 * Run multiple games and collect statistics
 */
export function runTournament(agents, configs, numGamesPerConfig = 50, options = {}) {
    const verbose = options.verbose || false;
    const { rng: masterRng, seed: masterSeed } = createRNG(options.seed);
    const results = {
        totalGames: 0,
        wins: {},
        avgRounds: 0,
        configResults: [],
        seed: masterSeed,
    };
    // Init win counters for teams
    for (const team of TEAM_CONFIG) {
        results.wins[team.id] = 0;
    }
    let totalRounds = 0;
    for (const config of configs) {
        const configResult = {
            config: config.name || 'unknown',
            games: 0,
            wins: {},
            avgRounds: 0,
            noWinner: 0,
        };
        for (const team of TEAM_CONFIG.slice(0, config.numberOfTeams)) {
            configResult.wins[team.id] = 0;
        }
        let configRounds = 0;
        for (let g = 0; g < numGamesPerConfig; g++) {
            // Derive per-game seed from master RNG
            const gameSeed = (masterRng() * 0xffffffff) >>> 0;
            const result = simulateGame(agents, config, { verbose, maxRounds: 200, seed: gameSeed });
            results.totalGames++;
            configResult.games++;
            totalRounds += result.rounds;
            configRounds += result.rounds;
            if (result.winner) {
                results.wins[result.winner] = (results.wins[result.winner] || 0) + 1;
                configResult.wins[result.winner] = (configResult.wins[result.winner] || 0) + 1;
            }
            else {
                configResult.noWinner++;
            }
        }
        configResult.avgRounds = configRounds / configResult.games;
        results.configResults.push(configResult);
    }
    results.avgRounds = totalRounds / results.totalGames;
    // Agent stats (use cumulative values that persist across game resets)
    results.agentStats = agents.map(a => ({
        name: a.name,
        strategy: a.strategy.name,
        gamesPlayed: a.gamesPlayed,
        wins: a.wins,
        winRate: (a.wins / a.gamesPlayed * 100).toFixed(1) + '%',
        totalSpent: Math.round(a.cumulativeSpent),
        totalEarned: Math.round(a.cumulativeEarned),
        profit: Math.round(a.cumulativeEarned - a.cumulativeSpent),
        roi: a.cumulativeSpent > 0
            ? ((a.cumulativeEarned - a.cumulativeSpent) / a.cumulativeSpent * 100).toFixed(1) + '%'
            : '0.0%',
    }));
    return results;
}
/**
 * Pretty-print game state for debugging
 */
export function printBoard(gameState) {
    const radius = gameState.gridSize.radius;
    const gridType = (gameState.gridSize.type || 'hexagonal');
    const head = gameState.snake.body[0];
    const body = gameState.snake.body.slice(1);
    const posMap = new Map();
    if (head)
        posMap.set(`${head.q},${head.r}`, 'H');
    body.forEach((seg) => posMap.set(`${seg.q},${seg.r}`, '='));
    for (const [teamId, fruits] of Object.entries(gameState.apples)) {
        for (const fruit of fruits) {
            const key = `${fruit.q},${fruit.r}`;
            if (!posMap.has(key))
                posMap.set(key, teamId);
        }
    }
    const lines = [];
    if (gridType === 'cartesian') {
        // Simple square grid
        for (let r = -radius; r <= radius; r++) {
            const row = [];
            for (let q = -radius; q <= radius; q++) {
                const key = `${q},${r}`;
                row.push(posMap.get(key) || '.');
            }
            lines.push(row.join('   '));
        }
    }
    else {
        // Hex grid with staggered indentation
        for (let r = -radius; r <= radius; r++) {
            const validQ = [];
            for (let q = -radius; q <= radius; q++) {
                if (isInBounds(q, r, radius))
                    validQ.push(q);
            }
            const maxHexes = 2 * radius + 1;
            const indent = ' '.repeat((maxHexes - validQ.length) * 2);
            const row = validQ.map(q => {
                const key = `${q},${r}`;
                return posMap.get(key) || '.';
            }).join('   ');
            lines.push(indent + row);
        }
    }
    console.log(lines.join('\n'));
    console.log(`Dir: ${gameState.snake.currentDirection} | Round: ${gameState.round} | Scores: ${JSON.stringify(gameState.fruitScores)}`);
}
//# sourceMappingURL=simulator.js.map