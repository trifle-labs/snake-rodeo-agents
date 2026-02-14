/**
 * Game state utilities and hex grid helpers
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface HexPos {
  q: number;
  r: number;
}

export type Direction = 'n' | 'ne' | 'se' | 's' | 'sw' | 'nw';

export interface GridSize {
  radius: number;
}

export interface Snake {
  body: HexPos[];
  currentDirection?: Direction;
  currentWinningTeam?: string | null;
}

export interface Team {
  id: string;
  name?: string;
  color?: string;
  emoji?: string;
  [key: string]: unknown;
}

export interface ParsedTeam extends Team {
  score: number;
  pool: number;
  closestFruit: ClosestFruitResult | null;
}

export interface ClosestFruitResult {
  fruit: HexPos;
  distance: number;
}

export interface BfsResult {
  distance: number;
  firstDir: Direction | null;
}

export interface GameState {
  snake?: Snake;
  gridSize?: GridSize;
  gameActive?: boolean;
  round?: number;
  prizePool?: number;
  minBid?: number;
  countdown?: number;
  config?: {
    initialMinBid?: number;
    fruitsToWin?: number;
    [key: string]: unknown;
  };
  teams?: Team[];
  fruitScores?: Record<string, number>;
  teamPools?: Record<string, number>;
  apples?: Record<string, HexPos[]>;
  votes?: Record<string, unknown>;
  winner?: string | null;
  error?: string;
  [key: string]: unknown;
}

export interface ParsedGameState {
  active: boolean | undefined;
  round: number | undefined;
  prizePool: number;
  minBid: number;
  initialMinBid: number;
  countdown: number;
  inExtensionWindow: boolean;
  extensions: number;
  fruitsToWin: number;
  gridRadius: number;
  head: HexPos;
  snakeLength: number;
  currentDirection: Direction | undefined;
  currentWinningTeam: string | undefined;
  teams: ParsedTeam[];
  validDirections: Direction[];
  votes: Record<string, unknown>;
  winner: string | undefined;
  raw: GameState;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Hex directions and their offsets (flat-top hexagonal grid, axial coordinates)
export const HEX_DIRECTIONS: Record<Direction, HexPos> = {
  n:  { q:  0, r: -1 },
  ne: { q:  1, r: -1 },
  se: { q:  1, r:  0 },
  s:  { q:  0, r:  1 },
  sw: { q: -1, r:  1 },
  nw: { q: -1, r:  0 },
};

export const OPPOSITE_DIRECTIONS: Record<Direction, Direction> = {
  n: 's', s: 'n',
  ne: 'sw', sw: 'ne',
  se: 'nw', nw: 'se',
};

export const ALL_DIRECTIONS: Direction[] = Object.keys(HEX_DIRECTIONS) as Direction[];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if coordinates are within hex grid bounds
 */
export function isInBounds(q: number, r: number, radius: number): boolean {
  return Math.abs(q) <= radius && Math.abs(r) <= radius && Math.abs(q + r) <= radius;
}

/**
 * Check if a position is on the snake body
 */
export function isOnSnakeBody(q: number, r: number, snakeBody: HexPos[]): boolean {
  return snakeBody.some(seg => seg.q === q && seg.r === r);
}

/**
 * Calculate hex distance between two points in axial coordinates
 * Uses cube coordinate conversion: for axial (q, r), cube is (q, r, -q-r)
 * Distance = max(|dq|, |dr|, |dq + dr|) where dq = q1 - q2, dr = r1 - r2
 */
export function hexDistance(a: HexPos, b: HexPos): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  // In cube coordinates: dz = -dq - dr
  // Distance is max(|dx|, |dy|, |dz|) = max(|dq|, |dr|, |dq + dr|)
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

/**
 * Get all valid directions the snake can move
 */
export function getValidDirections(gameState: GameState): Direction[] {
  if (!gameState?.snake?.body) return [];

  const head = gameState.snake.body[0];
  const radius = gameState.gridSize?.radius || 3;
  const valid: Direction[] = [];

  for (const [dir, offset] of Object.entries(HEX_DIRECTIONS) as [Direction, HexPos][]) {
    const newQ = head.q + offset.q;
    const newR = head.r + offset.r;

    // Check bounds
    if (!isInBounds(newQ, newR, radius)) continue;

    // Check self-collision (skip head, check rest of body)
    if (isOnSnakeBody(newQ, newR, gameState.snake.body.slice(1))) continue;

    valid.push(dir);
  }

  return valid;
}

/**
 * Find the closest fruit for a team
 */
export function findClosestFruit(
  head: HexPos,
  fruits: Record<string, HexPos[]>,
  teamId: string,
): ClosestFruitResult | null {
  const teamFruits = fruits[teamId] || [];
  if (teamFruits.length === 0) return null;

  let closest: HexPos | null = null;
  let minDist = Infinity;

  for (const fruit of teamFruits) {
    const dist = hexDistance(head, fruit);
    if (dist < minDist) {
      minDist = dist;
      closest = fruit;
    }
  }

  return { fruit: closest!, distance: minDist };
}

/**
 * Get the best direction toward a target
 */
export function bestDirectionToward(
  head: HexPos,
  target: HexPos,
  validDirs: Direction[],
): Direction | null {
  let bestDir: Direction | null = null;
  let bestDist = Infinity;

  for (const dir of validDirs) {
    const offset = HEX_DIRECTIONS[dir];
    const newPos: HexPos = { q: head.q + offset.q, r: head.r + offset.r };
    const dist = hexDistance(newPos, target);
    if (dist < bestDist) {
      bestDist = dist;
      bestDir = dir;
    }
  }

  return bestDir;
}

/**
 * Count exits from a position (safety metric)
 */
export function countExits(
  pos: HexPos,
  gameState: GameState,
  excludeDir: Direction | null = null,
): number {
  const radius = gameState.gridSize?.radius || 3;
  const snakeBody = gameState.snake?.body || [];
  let exits = 0;

  for (const [dir, offset] of Object.entries(HEX_DIRECTIONS) as [Direction, HexPos][]) {
    if (excludeDir && dir === excludeDir) continue;

    const newQ = pos.q + offset.q;
    const newR = pos.r + offset.r;

    if (!isInBounds(newQ, newR, radius)) continue;
    if (isOnSnakeBody(newQ, newR, snakeBody)) continue;

    exits++;
  }

  return exits;
}

// ---------------------------------------------------------------------------
// Round timing
// ---------------------------------------------------------------------------

/**
 * Round timing constants (must match server config)
 */
export const ROUND_TIMING = {
  baseDurationSec: 10,
  extensionPeriodSec: 5,
} as const;

// ---------------------------------------------------------------------------
// Parse game state
// ---------------------------------------------------------------------------

/**
 * Parse game state into a more usable format
 */
export function parseGameState(gs: any): ParsedGameState | null {
  if (!gs || gs.error) return null;

  const head: HexPos | undefined = gs.snake?.body?.[0];
  if (!head) return null;

  const teams: ParsedTeam[] = (gs.teams || []).map((team: Team) => ({
    ...team,
    score: gs.fruitScores?.[team.id] || 0,
    pool: gs.teamPools?.[team.id] || 0,
    closestFruit: findClosestFruit(head, gs.apples || {}, team.id),
  }));

  const countdown: number = gs.countdown ?? ROUND_TIMING.baseDurationSec;
  const initialMinBid: number = gs.config?.initialMinBid || 1;
  const currentMinBid: number = gs.minBid || 1;

  // How many extensions have happened this round (minBid doubles each time)
  const extensions = currentMinBid > initialMinBid
    ? Math.round(Math.log2(currentMinBid / initialMinBid))
    : 0;

  // In the extension window = voting now would trigger an extension + minBid doubling
  const inExtensionWindow = countdown <= ROUND_TIMING.extensionPeriodSec && countdown > 0;

  return {
    active: gs.gameActive,
    round: gs.round,
    prizePool: gs.prizePool || 10,
    minBid: currentMinBid,
    initialMinBid,
    countdown,
    inExtensionWindow,
    extensions,
    fruitsToWin: gs.config?.fruitsToWin || 3,
    gridRadius: gs.gridSize?.radius || 3,
    head,
    snakeLength: gs.snake?.body?.length || 0,
    currentDirection: gs.snake?.currentDirection,
    currentWinningTeam: gs.snake?.currentWinningTeam,
    teams,
    validDirections: getValidDirections(gs),
    votes: gs.votes || {},
    winner: gs.winner,
    raw: gs,
  };
}

/**
 * Get team by ID
 */
export function getTeamById(parsed: ParsedGameState, teamId: string): ParsedTeam | undefined {
  return parsed?.teams?.find(t => t.id === teamId);
}

// ---------------------------------------------------------------------------
// BFS / Flood-fill
// ---------------------------------------------------------------------------

interface BfsNode {
  q: number;
  r: number;
  dist: number;
  firstDir: Direction;
}

/**
 * BFS shortest path from a position to a target, respecting snake body and grid bounds.
 * Returns the path length (number of moves) or Infinity if unreachable.
 * Also returns the first direction to take.
 *
 * When timeAware is true, accounts for the snake's tail moving: body segment
 * body[i] will clear after (body.length - i) moves, so BFS allows passing
 * through a body cell if the BFS distance to that cell >= its clear time.
 * This finds shorter paths through the snake's own trailing body.
 */
export function bfsDistance(
  from: HexPos,
  to: HexPos,
  gameState: GameState,
  excludeHead: boolean = true,
  timeAware: boolean = false,
): BfsResult {
  const radius = gameState.gridSize?.radius || 3;
  const body = gameState.snake?.body || [];
  const bodySlice = excludeHead ? body.slice(1) : body;
  const startIdx = excludeHead ? 1 : 0;

  // Build obstacle map: key -> clearTime (when it becomes passable)
  // For static BFS (timeAware=false), clearTime = Infinity (never passable)
  const obstacleClearTime = new Map<string, number>();
  for (let i = 0; i < bodySlice.length; i++) {
    const seg = bodySlice[i];
    const key = `${seg.q},${seg.r}`;
    const bodyIdx = startIdx + i;
    // Tail clears first: body[length-1] clears in 1 move, body[length-2] in 2, etc.
    const clearTime = timeAware ? (body.length - bodyIdx) : Infinity;
    // If multiple segments occupy the same cell (shouldn't happen), keep the later clear time
    const existing = obstacleClearTime.get(key);
    if (existing === undefined || clearTime < existing) {
      obstacleClearTime.set(key, clearTime);
    }
  }

  const isBlocked = (key: string, dist: number): boolean => {
    const clearTime = obstacleClearTime.get(key);
    if (clearTime === undefined) return false;
    return dist < clearTime;
  };

  const start = `${from.q},${from.r}`;
  const goal = `${to.q},${to.r}`;

  if (start === goal) return { distance: 0, firstDir: null };

  const visited = new Set<string>([start]);
  const queue: BfsNode[] = [];

  for (const [dir, offset] of Object.entries(HEX_DIRECTIONS) as [Direction, HexPos][]) {
    const nq = from.q + offset.q;
    const nr = from.r + offset.r;
    const key = `${nq},${nr}`;

    if (!isInBounds(nq, nr, radius)) continue;
    if (isBlocked(key, 1)) continue;

    if (key === goal) return { distance: 1, firstDir: dir };

    visited.add(key);
    queue.push({ q: nq, r: nr, dist: 1, firstDir: dir });
  }

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];

    for (const [, offset] of Object.entries(HEX_DIRECTIONS) as [Direction, HexPos][]) {
      const nq = cur.q + offset.q;
      const nr = cur.r + offset.r;
      const key = `${nq},${nr}`;
      const newDist = cur.dist + 1;

      if (!isInBounds(nq, nr, radius)) continue;
      if (isBlocked(key, newDist)) continue;
      if (visited.has(key)) continue;

      if (key === goal) return { distance: newDist, firstDir: cur.firstDir };

      visited.add(key);
      queue.push({ q: nq, r: nr, dist: newDist, firstDir: cur.firstDir });
    }
  }

  return { distance: Infinity, firstDir: null };
}

/**
 * Flood-fill reachable area from a position.
 * Returns the count of reachable cells (a proxy for how "trapped" you are).
 */
export function floodFillSize(
  pos: HexPos,
  gameState: GameState,
  excludeDir: Direction | null = null,
): number {
  const radius = gameState.gridSize?.radius || 3;
  const body = gameState.snake?.body || [];
  const obstacles = new Set<string>();
  for (const seg of body) {
    obstacles.add(`${seg.q},${seg.r}`);
  }

  const start = `${pos.q},${pos.r}`;
  const visited = new Set<string>([start]);
  const queue: HexPos[] = [pos];
  let head = 0;

  while (head < queue.length) {
    const cur = queue[head++];
    for (const [dir, offset] of Object.entries(HEX_DIRECTIONS) as [Direction, HexPos][]) {
      if (excludeDir && dir === excludeDir) continue;
      const nq = cur.q + offset.q;
      const nr = cur.r + offset.r;
      const key = `${nq},${nr}`;

      if (!isInBounds(nq, nr, radius)) continue;
      if (obstacles.has(key)) continue;
      if (visited.has(key)) continue;

      visited.add(key);
      queue.push({ q: nq, r: nr });
    }
  }

  return visited.size;
}
