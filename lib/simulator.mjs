/**
 * Local Snake Game Simulator
 *
 * Replicates the trifle-bot server game logic for offline testing.
 * Multiple AI agents compete by voting on directions each round.
 * The simulator resolves votes and advances the game state.
 */

import {
  HEX_DIRECTIONS,
  OPPOSITE_DIRECTIONS,
  ALL_DIRECTIONS,
  hexDistance,
  isInBounds,
  isOnSnakeBody,
  getValidDirections,
  findClosestFruit,
  parseGameState,
  countExits,
} from './game-state.mjs';

// Team configs matching the server
const TEAM_CONFIG = [
  { id: 'A', name: 'Blue', color: '#0066FF', emoji: '🫐' },
  { id: 'B', name: 'Red', color: '#FF0000', emoji: '🍎' },
  { id: 'C', name: 'Yellow', color: '#FFDD00', emoji: '🍌' },
  { id: 'D', name: 'Green', color: '#00CC00', emoji: '🥝' },
  { id: 'E', name: 'Purple', color: '#9900FF', emoji: '🍇' },
  { id: 'F', name: 'Orange', color: '#FF6600', emoji: '🍊' },
];

// Rodeo cycle configs matching the server
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
];

/**
 * Generate a random fruit position avoiding snake body and existing fruits
 */
function generateFruitPosition(snakeBody, existingFruits, radius) {
  let minDistFromCenter;
  if (radius === 2) minDistFromCenter = 1;
  else if (radius === 3) minDistFromCenter = 2;
  else minDistFromCenter = Math.floor(radius * 0.5);

  for (let attempts = 0; attempts < 1000; attempts++) {
    const angle = Math.random() * 2 * Math.PI;
    const distance = minDistFromCenter + Math.random() * (radius - minDistFromCenter);
    const q = Math.round(distance * Math.cos(angle));
    const r = Math.round(distance * Math.sin(angle) - q / 2);

    if (!isInBounds(q, r, radius)) continue;
    if (snakeBody.some(seg => seg.q === q && seg.r === r)) continue;
    if (existingFruits.some(f => f.q === q && f.r === r)) continue;

    return { q, r };
  }
  // Fallback: find any valid position
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (!isInBounds(q, r, radius)) continue;
      if (snakeBody.some(seg => seg.q === q && seg.r === r)) continue;
      if (existingFruits.some(f => f.q === q && f.r === r)) continue;
      return { q, r };
    }
  }
  return { q: 0, r: 0 };
}

/**
 * Create initial game state for a simulation
 */
export function createGameState(config) {
  const teams = TEAM_CONFIG.slice(0, config.numberOfTeams);
  const radius = config.hexRadius;

  // Snake starts at center heading north
  const body = [{ q: 0, r: 0 }];

  // Generate fruits for each team
  const apples = {};
  const allFruits = [];
  for (const team of teams) {
    apples[team.id] = [];
    for (let i = 0; i < config.fruitsPerTeam; i++) {
      const fruit = generateFruitPosition(body, allFruits, radius);
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
      currentDirection: 'n',
      currentWinningTeam: null,
      currentWinningUser: null,
    },
    gridSize: { type: 'hexagonal', radius },
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
export function advanceRound(gameState, direction, winningTeamId) {
  const head = gameState.snake.body[0];
  const offset = HEX_DIRECTIONS[direction];
  const newHead = {
    q: head.q + offset.q,
    r: head.r + offset.r,
    winningTeam: winningTeamId,
  };

  const radius = gameState.gridSize.radius;

  // Check collision (boundary or self)
  if (!isInBounds(newHead.q, newHead.r, radius)) {
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
    if (ateFruit) break;
  }

  const newApples = { ...gameState.apples };
  const newFruitScores = { ...gameState.fruitScores };
  const newEatenFruits = [...gameState.eatenFruits];

  if (ateFruit) {
    // Remove the eaten fruit
    newApples[ateTeam] = newApples[ateTeam].filter(
      f => !(f.q === ateFruit.q && f.r === ateFruit.r)
    );

    // Credit to the winning team (the team that controlled the snake this round)
    if (winningTeamId) {
      newFruitScores[winningTeamId] = (newFruitScores[winningTeamId] || 0) + 1;
    }

    newEatenFruits.push({
      ...ateFruit,
      team: winningTeamId || ateTeam,
      emoji: TEAM_CONFIG.find(t => t.id === ateTeam)?.emoji || '?',
      order: newEatenFruits.length + 1,
    });

    // Respawn fruit if enabled
    if (gameState.config.respawn) {
      const allFruits = Object.values(newApples).flat();
      const newFruit = generateFruitPosition(newBody, allFruits, radius);
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
  constructor(id, name, strategy, balance = 100) {
    this.id = id;
    this.name = name;
    this.strategy = strategy;
    this.balance = balance;
    this.currentTeam = null;
    this.totalSpent = 0;
    this.votesPlaced = 0;
    this.wins = 0;
    this.gamesPlayed = 0;
    this.fruitsCollected = 0;
  }

  reset(balance = 100) {
    this.currentTeam = null;
    this.totalSpent = 0;
    this.votesPlaced = 0;
  }

  computeVote(gameState) {
    const parsed = parseGameState(gameState);
    if (!parsed || !parsed.active) return null;

    const state = {
      currentTeam: this.currentTeam,
      roundSpend: 0,
      roundVoteCount: 0,
      lastRound: -1,
      gamesPlayed: this.gamesPlayed,
      votesPlaced: this.votesPlaced,
      wins: this.wins,
    };

    const vote = this.strategy.computeVote(parsed, this.balance, state);
    if (!vote || vote.skip) return null;

    this.currentTeam = vote.team.id;
    this.balance -= vote.amount;
    this.totalSpent += vote.amount;
    this.votesPlaced++;

    return vote;
  }
}

/**
 * Run a single simulated game with multiple agents.
 *
 * Each round:
 * 1. All agents compute votes
 * 2. Last vote wins (simulates the real auction)
 * 3. Snake moves in the winning direction
 * 4. Repeat until a team wins or max rounds reached
 */
export function simulateGame(agents, config, options = {}) {
  const maxRounds = options.maxRounds || 200;
  const verbose = options.verbose || false;

  let gameState = createGameState(config);

  // Reset agents
  for (const agent of agents) {
    agent.reset(config.startingBalance * 2);
    agent.gamesPlayed++;
  }

  const roundLog = [];

  for (let round = 0; round < maxRounds; round++) {
    if (!gameState.gameActive) break;

    // Collect votes from all agents
    const votes = [];
    for (const agent of agents) {
      const vote = agent.computeVote(gameState);
      if (vote) {
        votes.push({ agent, vote });
      }
    }

    if (votes.length === 0) {
      // No votes - snake continues in current direction
      const validDirs = getValidDirections(gameState);
      if (validDirs.length === 0) {
        // Dead end - game over
        if (verbose) console.log(`Round ${round}: Dead end!`);
        break;
      }

      // Continue in current direction if valid, otherwise pick first valid
      const dir = validDirs.includes(gameState.snake.currentDirection)
        ? gameState.snake.currentDirection
        : validDirs[0];

      const result = advanceRound(gameState, dir, null);
      gameState = result.gameState;
      continue;
    }

    // "Last vote wins" - simulate by picking the vote from the agent
    // that would go last. In simulation, we pick the last vote.
    const lastVote = votes[votes.length - 1];
    const direction = lastVote.vote.direction;
    const winningTeam = lastVote.vote.team.id;

    // Record team pool contributions
    for (const { agent, vote } of votes) {
      gameState.teamPools[vote.team.id] = (gameState.teamPools[vote.team.id] || 0) + vote.amount;
      gameState.prizePool += vote.amount;
    }

    // Validate direction
    const validDirs = getValidDirections(gameState);
    let actualDir = direction;
    if (!validDirs.includes(direction)) {
      actualDir = validDirs[0];
      if (!actualDir) break; // dead end
    }

    const result = advanceRound(gameState, actualDir, winningTeam);

    if (verbose && result.ateFruit) {
      console.log(`Round ${round}: ${winningTeam} ate fruit! Scores: ${JSON.stringify(result.gameState.fruitScores)}`);
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
      // Credit wins to agents on the winning team
      for (const agent of agents) {
        if (agent.currentTeam === result.winner) {
          agent.wins++;
        }
      }

      if (verbose) {
        console.log(`Game over! Winner: ${result.winner} in ${round + 1} rounds`);
        console.log(`Final scores: ${JSON.stringify(gameState.fruitScores)}`);
      }
      break;
    }
  }

  return {
    gameState,
    winner: gameState.winner,
    rounds: gameState.round,
    fruitScores: { ...gameState.fruitScores },
    roundLog,
  };
}

/**
 * Run multiple games and collect statistics
 */
export function runTournament(agents, configs, numGamesPerConfig = 50, options = {}) {
  const verbose = options.verbose || false;
  const results = {
    totalGames: 0,
    wins: {},
    avgRounds: 0,
    configResults: [],
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

    for (let g = 0; g < numGamesPerConfig; g++) {
      const result = simulateGame(agents, config, { verbose, maxRounds: 200 });
      results.totalGames++;
      configResult.games++;
      totalRounds += result.rounds;

      if (result.winner) {
        results.wins[result.winner] = (results.wins[result.winner] || 0) + 1;
        configResult.wins[result.winner] = (configResult.wins[result.winner] || 0) + 1;
      } else {
        configResult.noWinner++;
      }
    }

    configResult.avgRounds = totalRounds / configResult.games;
    results.configResults.push(configResult);
  }

  results.avgRounds = totalRounds / results.totalGames;

  // Agent stats
  results.agentStats = agents.map(a => ({
    name: a.name,
    strategy: a.strategy.name,
    gamesPlayed: a.gamesPlayed,
    wins: a.wins,
    winRate: (a.wins / a.gamesPlayed * 100).toFixed(1) + '%',
  }));

  return results;
}

/**
 * Pretty-print game state for debugging
 */
export function printBoard(gameState) {
  const radius = gameState.gridSize.radius;
  const head = gameState.snake.body[0];
  const body = gameState.snake.body.slice(1);

  const posMap = new Map();
  if (head) posMap.set(`${head.q},${head.r}`, 'H');
  body.forEach((seg, i) => posMap.set(`${seg.q},${seg.r}`, '='));
  for (const [teamId, fruits] of Object.entries(gameState.apples)) {
    for (const fruit of fruits) {
      const key = `${fruit.q},${fruit.r}`;
      if (!posMap.has(key)) posMap.set(key, teamId);
    }
  }

  const lines = [];
  for (let r = -radius; r <= radius; r++) {
    const validQ = [];
    for (let q = -radius; q <= radius; q++) {
      if (isInBounds(q, r, radius)) validQ.push(q);
    }
    const maxHexes = 2 * radius + 1;
    const indent = ' '.repeat((maxHexes - validQ.length) * 2);
    const row = validQ.map(q => {
      const key = `${q},${r}`;
      return posMap.get(key) || '.';
    }).join('   ');
    lines.push(indent + row);
  }

  console.log(lines.join('\n'));
  console.log(`Dir: ${gameState.snake.currentDirection} | Round: ${gameState.round} | Scores: ${JSON.stringify(gameState.fruitScores)}`);
}
