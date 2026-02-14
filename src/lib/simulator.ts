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
} from './game-state.js';

import type {
  HexPos,
  Direction,
  ParsedGameState,
} from './game-state.js';

import type { VoteResult, VoteAction, AgentState } from './strategies/base.js';

// Team configs matching the server
interface TeamConfig {
  id: string;
  name: string;
  color: string;
  emoji: string;
  [key: string]: unknown;
}

const TEAM_CONFIG: TeamConfig[] = [
  { id: 'A', name: 'Blue', color: '#0066FF', emoji: '\u{1FAD0}' },
  { id: 'B', name: 'Red', color: '#FF0000', emoji: '\u{1F34E}' },
  { id: 'C', name: 'Yellow', color: '#FFDD00', emoji: '\u{1F34C}' },
  { id: 'D', name: 'Green', color: '#00CC00', emoji: '\u{1F95D}' },
  { id: 'E', name: 'Purple', color: '#9900FF', emoji: '\u{1F347}' },
  { id: 'F', name: 'Orange', color: '#FF6600', emoji: '\u{1F34A}' },
];

// Rodeo cycle configs matching the server
export interface RodeoCycleConfig {
  name: string;
  numberOfTeams: number;
  hexRadius: number;
  fruitsPerTeam: number;
  fruitsToWin: number;
  startingBalance: number;
  initialMinBid: number;
  initialSnakeLength: number;
  respawn: boolean;
  simpleBid: boolean;
}

export const RODEO_CYCLES: RodeoCycleConfig[] = [
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

/** A fruit that was eaten during a game */
interface EatenFruit extends HexPos {
  team: string | null;
  emoji: string;
  order: number;
}

/**
 * Raw game state as used by the simulator (mirrors the server shape).
 */
export interface SimGameState {
  id: number;
  snake: {
    body: HexPos[];
    currentDirection: Direction;
    currentWinningTeam: string | null;
    currentWinningUser: string | null;
  };
  gridSize: { type: string; radius: number };
  apples: Record<string, HexPos[]>;
  eatenFruits: EatenFruit[];
  fruitScores: Record<string, number>;
  teamPools: Record<string, number>;
  votes: Record<string, unknown>;
  gameActive: boolean;
  winner: string | null;
  prizePool: number;
  nextMoveTime: number;
  round: number;
  countdown: number;
  totalRoundTime: number;
  minBid: number;
  nonce: number;
  config: {
    hexRadius: number;
    roundDurationSeconds: number;
    newGameDelaySeconds: number;
    extensionPeriodSeconds: number;
    fruitsPerTeam: number;
    fruitsToWin: number;
    initialMinBid: number;
    startingBalance: number;
    numberOfTeams: number;
    auctionMode: string;
    respawn: boolean;
    collision: boolean;
    simpleBid: boolean;
    initialSnakeLength: number;
    grow: boolean;
  };
  teams: TeamConfig[];
  [key: string]: unknown;
}

export interface AdvanceResult {
  gameState: SimGameState;
  event: string;
  ateFruit?: HexPos | null;
  ateTeam?: string | null;
  winner?: string | null;
}

export interface SimulateGameResult {
  gameState: SimGameState;
  winner: string | null;
  rounds: number;
  fruitScores: Record<string, number>;
  roundLog: RoundLogEntry[];
}

interface RoundLogEntry {
  round: number;
  direction: Direction;
  winningTeam: string;
  event: string;
  votes: { agent: string; dir: Direction; team: string }[];
}

export interface Strategy {
  name: string;
  description?: string;
  computeVote(parsed: ParsedGameState, balance: number, state: AgentState): VoteResult;
  shouldCounterBid?(parsed: ParsedGameState, balance: number, state: AgentState, ourVote: VoteAction): VoteResult;
}

interface ConfigResult {
  config: string;
  games: number;
  wins: Record<string, number>;
  avgRounds: number;
  noWinner: number;
}

export interface TournamentResults {
  totalGames: number;
  wins: Record<string, number>;
  avgRounds: number;
  configResults: ConfigResult[];
  agentStats?: { name: string; strategy: string; gamesPlayed: number; wins: number; winRate: string }[];
}

/**
 * Generate a random fruit position avoiding snake body and existing fruits
 */
function generateFruitPosition(
  snakeBody: HexPos[],
  existingFruits: HexPos[],
  radius: number,
): HexPos {
  let minDistFromCenter: number;
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
export function createGameState(config: RodeoCycleConfig): SimGameState {
  const teams = TEAM_CONFIG.slice(0, config.numberOfTeams);
  const radius = config.hexRadius;

  // Snake starts at center heading north
  const body: HexPos[] = [{ q: 0, r: 0 }];

  // Generate fruits for each team
  const apples: Record<string, HexPos[]> = {};
  const allFruits: HexPos[] = [];
  for (const team of teams) {
    apples[team.id] = [];
    for (let i = 0; i < config.fruitsPerTeam; i++) {
      const fruit = generateFruitPosition(body, allFruits, radius);
      apples[team.id].push(fruit);
      allFruits.push(fruit);
    }
  }

  const fruitScores: Record<string, number> = {};
  const teamPools: Record<string, number> = {};
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
export function advanceRound(
  gameState: SimGameState,
  direction: Direction,
  winningTeamId: string | null,
): AdvanceResult {
  const head = gameState.snake.body[0];
  const offset = HEX_DIRECTIONS[direction];
  const newHead: HexPos = {
    q: head.q + offset.q,
    r: head.r + offset.r,
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
  let ateFruit: HexPos | null = null;
  let ateTeam: string | null = null;
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

  const newApples: Record<string, HexPos[]> = { ...gameState.apples };
  const newFruitScores: Record<string, number> = { ...gameState.fruitScores };
  const newEatenFruits: EatenFruit[] = [...gameState.eatenFruits];

  if (ateFruit) {
    // Remove the eaten fruit
    newApples[ateTeam!] = newApples[ateTeam!].filter(
      f => !(f.q === ateFruit!.q && f.r === ateFruit!.r),
    );

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
      const newFruit = generateFruitPosition(newBody, allFruits, radius);
      newApples[ateTeam!] = [...newApples[ateTeam!], newFruit];
    }
  }

  // Snake growth: remove tail unless fruit was eaten (classic snake)
  const finalBody = ateFruit ? newBody : newBody.slice(0, -1);

  // Check win condition
  let winner: string | null = null;
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

  const newState: SimGameState = {
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
  id: string;
  name: string;
  strategy: Strategy;
  balance: number;
  currentTeam: string | null;
  totalSpent: number;
  votesPlaced: number;
  wins: number;
  gamesPlayed: number;
  fruitsCollected: number;

  constructor(id: string, name: string, strategy: Strategy, balance: number = 100) {
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

  reset(balance: number = 100): void {
    this.currentTeam = null;
    this.totalSpent = 0;
    this.votesPlaced = 0;
  }

  computeVote(gameState: SimGameState): VoteAction | null {
    const parsed = parseGameState(gameState);
    if (!parsed || !parsed.active) return null;

    const state: AgentState = {
      currentTeam: this.currentTeam,
      roundSpend: 0,
      roundVoteCount: 0,
      lastRound: -1,
      gamesPlayed: this.gamesPlayed,
      votesPlaced: this.votesPlaced,
      wins: this.wins,
    };

    const result = this.strategy.computeVote(parsed, this.balance, state);
    if (!result || 'skip' in result) return null;

    this.currentTeam = result.team.id;
    this.balance -= result.amount;
    this.totalSpent += result.amount;
    this.votesPlaced++;

    return result;
  }
}

export interface SimulateOptions {
  maxRounds?: number;
  verbose?: boolean;
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
export function simulateGame(
  agents: SimAgent[],
  config: RodeoCycleConfig,
  options: SimulateOptions = {},
): SimulateGameResult {
  const maxRounds = options.maxRounds || 200;
  const verbose = options.verbose || false;

  let gameState = createGameState(config);

  // Reset agents
  for (const agent of agents) {
    agent.reset(config.startingBalance * 2);
    agent.gamesPlayed++;
  }

  const roundLog: RoundLogEntry[] = [];

  for (let round = 0; round < maxRounds; round++) {
    if (!gameState.gameActive) break;

    // Collect votes from all agents
    const votes: { agent: SimAgent; vote: VoteAction }[] = [];
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
    let actualDir: Direction = direction;
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
export function runTournament(
  agents: SimAgent[],
  configs: RodeoCycleConfig[],
  numGamesPerConfig: number = 50,
  options: SimulateOptions = {},
): TournamentResults {
  const verbose = options.verbose || false;
  const results: TournamentResults = {
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
    const configResult: ConfigResult = {
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
export function printBoard(gameState: SimGameState): void {
  const radius = gameState.gridSize.radius;
  const head = gameState.snake.body[0];
  const body = gameState.snake.body.slice(1);

  const posMap = new Map<string, string>();
  if (head) posMap.set(`${head.q},${head.r}`, 'H');
  body.forEach((seg) => posMap.set(`${seg.q},${seg.r}`, '='));
  for (const [teamId, fruits] of Object.entries(gameState.apples)) {
    for (const fruit of fruits) {
      const key = `${fruit.q},${fruit.r}`;
      if (!posMap.has(key)) posMap.set(key, teamId);
    }
  }

  const lines: string[] = [];
  for (let r = -radius; r <= radius; r++) {
    const validQ: number[] = [];
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
