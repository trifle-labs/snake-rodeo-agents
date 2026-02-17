/**
 * Game state utilities and grid helpers (hex + cartesian)
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface HexPos {
  q: number;
  r: number;
}

export type HexDirection = 'n' | 'ne' | 'se' | 's' | 'sw' | 'nw';
export type CartesianDirection = 'up' | 'down' | 'left' | 'right';
export type Direction = HexDirection | CartesianDirection;
export type GridType = 'hexagonal' | 'cartesian';

export interface GridSize {
  radius: number;
  type?: GridType;
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
    gridType?: GridType;
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
  gridType: GridType;
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
export const HEX_DIRECTIONS: Record<HexDirection, HexPos> = {
  n:  { q:  0, r: -1 },
  ne: { q:  1, r: -1 },
  se: { q:  1, r:  0 },
  s:  { q:  0, r:  1 },
  sw: { q: -1, r:  1 },
  nw: { q: -1, r:  0 },
};

export const OPPOSITE_DIRECTIONS: Record<HexDirection, HexDirection> = {
  n: 's', s: 'n',
  ne: 'sw', sw: 'ne',
  se: 'nw', nw: 'se',
};

export const ALL_DIRECTIONS: HexDirection[] = Object.keys(HEX_DIRECTIONS) as HexDirection[];

// Cartesian directions and their offsets (square grid, q=x r=y)
export const CARTESIAN_DIRECTIONS: Record<CartesianDirection, HexPos> = {
  up:    { q:  0, r: -1 },
  down:  { q:  0, r:  1 },
  left:  { q: -1, r:  0 },
  right: { q:  1, r:  0 },
};

export const CARTESIAN_OPPOSITES: Record<CartesianDirection, CartesianDirection> = {
  up: 'down', down: 'up',
  left: 'right', right: 'left',
};

export const ALL_CARTESIAN_DIRECTIONS: CartesianDirection[] = Object.keys(CARTESIAN_DIRECTIONS) as CartesianDirection[];

// Combined maps for direction lookups (works with any direction type)
export const ALL_DIRECTION_OFFSETS: Record<Direction, HexPos> = {
  ...HEX_DIRECTIONS,
  ...CARTESIAN_DIRECTIONS,
};

export const ALL_OPPOSITES: Record<Direction, Direction> = {
  ...OPPOSITE_DIRECTIONS,
  ...CARTESIAN_OPPOSITES,
};

/**
 * Get the direction entries for a grid type
 */
export function getDirectionsForGrid(gridType: GridType): [Direction, HexPos][] {
  if (gridType === 'cartesian') {
    return Object.entries(CARTESIAN_DIRECTIONS) as [CartesianDirection, HexPos][];
  }
  return Object.entries(HEX_DIRECTIONS) as [HexDirection, HexPos][];
}

/**
 * Detect grid type from a GameState
 */
export function detectGridType(gameState: GameState): GridType {
  return gameState?.gridSize?.type || gameState?.config?.gridType as GridType || 'hexagonal';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if coordinates are within grid bounds.
 * Hex: |q| <= r, |r| <= r, |q+r| <= r
 * Cartesian: |q| <= r, |r| <= r
 */
export function isInBounds(q: number, r: number, radius: number, gridType: GridType = 'hexagonal'): boolean {
  if (gridType === 'cartesian') {
    return Math.abs(q) <= radius && Math.abs(r) <= radius;
  }
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
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

/**
 * Calculate Manhattan distance between two points (for cartesian grids)
 */
export function manhattanDistance(a: HexPos, b: HexPos): number {
  return Math.abs(a.q - b.q) + Math.abs(a.r - b.r);
}

/**
 * Calculate distance using the appropriate metric for the grid type
 */
export function gridDistance(a: HexPos, b: HexPos, gridType: GridType = 'hexagonal'): number {
  return gridType === 'cartesian' ? manhattanDistance(a, b) : hexDistance(a, b);
}

/**
 * Get total cells for a grid
 */
export function getTotalCells(radius: number, gridType: GridType = 'hexagonal'): number {
  if (gridType === 'cartesian') {
    return (2 * radius + 1) ** 2;
  }
  return 3 * radius * (radius + 1) + 1;
}

/**
 * Get all valid directions the snake can move
 */
export function getValidDirections(gameState: GameState): Direction[] {
  if (!gameState?.snake?.body) return [];

  const head = gameState.snake.body[0];
  const radius = gameState.gridSize?.radius || 3;
  const gridType = detectGridType(gameState);
  const valid: Direction[] = [];

  for (const [dir, offset] of getDirectionsForGrid(gridType)) {
    const newQ = head.q + offset.q;
    const newR = head.r + offset.r;

    if (!isInBounds(newQ, newR, radius, gridType)) continue;
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
  gridType: GridType = 'hexagonal',
): ClosestFruitResult | null {
  const teamFruits = fruits[teamId] || [];
  if (teamFruits.length === 0) return null;

  let closest: HexPos | null = null;
  let minDist = Infinity;

  for (const fruit of teamFruits) {
    const dist = gridDistance(head, fruit, gridType);
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
  gridType: GridType = 'hexagonal',
): Direction | null {
  let bestDir: Direction | null = null;
  let bestDist = Infinity;

  for (const dir of validDirs) {
    const offset = ALL_DIRECTION_OFFSETS[dir];
    const newPos: HexPos = { q: head.q + offset.q, r: head.r + offset.r };
    const dist = gridDistance(newPos, target, gridType);
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
  const gridType = detectGridType(gameState);
  const snakeBody = gameState.snake?.body || [];
  let exits = 0;

  for (const [dir, offset] of getDirectionsForGrid(gridType)) {
    if (excludeDir && dir === excludeDir) continue;

    const newQ = pos.q + offset.q;
    const newR = pos.r + offset.r;

    if (!isInBounds(newQ, newR, radius, gridType)) continue;
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

  const gridType: GridType = gs.gridSize?.type || gs.config?.gridType || 'hexagonal';

  const teams: ParsedTeam[] = (gs.teams || []).map((team: Team) => ({
    ...team,
    score: gs.fruitScores?.[team.id] || 0,
    pool: gs.teamPools?.[team.id] || 0,
    closestFruit: findClosestFruit(head, gs.apples || {}, team.id, gridType),
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
    gridType,
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
  const gridType = detectGridType(gameState);
  const dirEntries = getDirectionsForGrid(gridType);
  const body = gameState.snake?.body || [];
  const bodySlice = excludeHead ? body.slice(1) : body;
  const startIdx = excludeHead ? 1 : 0;

  // Build obstacle map: key -> clearTime (when it becomes passable)
  const obstacleClearTime = new Map<string, number>();
  for (let i = 0; i < bodySlice.length; i++) {
    const seg = bodySlice[i];
    const key = `${seg.q},${seg.r}`;
    const bodyIdx = startIdx + i;
    const clearTime = timeAware ? (body.length - bodyIdx) : Infinity;
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

  for (const [dir, offset] of dirEntries) {
    const nq = from.q + offset.q;
    const nr = from.r + offset.r;
    const key = `${nq},${nr}`;

    if (!isInBounds(nq, nr, radius, gridType)) continue;
    if (isBlocked(key, 1)) continue;

    if (key === goal) return { distance: 1, firstDir: dir };

    visited.add(key);
    queue.push({ q: nq, r: nr, dist: 1, firstDir: dir });
  }

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];

    for (const [, offset] of dirEntries) {
      const nq = cur.q + offset.q;
      const nr = cur.r + offset.r;
      const key = `${nq},${nr}`;
      const newDist = cur.dist + 1;

      if (!isInBounds(nq, nr, radius, gridType)) continue;
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
  const gridType = detectGridType(gameState);
  const dirEntries = getDirectionsForGrid(gridType);
  const body = gameState.snake?.body || [];
  const obstacles = new Set<string>();
  for (const seg of body) {
    obstacles.add(`${seg.q},${seg.r}`);
  }

  const start = `${pos.q},${pos.r}`;
  const visited = new Set<string>([start]);
  const queue: HexPos[] = [pos];
  let head = 0;
  let isStart = true;

  while (head < queue.length) {
    const cur = queue[head++];
    for (const [dir, offset] of dirEntries) {
      // Only exclude the "came from" direction at the starting cell
      if (isStart && excludeDir && dir === excludeDir) continue;
      const nq = cur.q + offset.q;
      const nr = cur.r + offset.r;
      const key = `${nq},${nr}`;

      if (!isInBounds(nq, nr, radius, gridType)) continue;
      if (obstacles.has(key)) continue;
      if (visited.has(key)) continue;

      visited.add(key);
      queue.push({ q: nq, r: nr });
    }
    isStart = false;
  }

  return visited.size;
}
