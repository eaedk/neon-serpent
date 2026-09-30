/**
 * Shared, framework-free types for the game core.
 * Nothing in `src/core` touches the DOM so the rules can be unit tested.
 */

/** Integer grid coordinate. */
export interface Vec {
  x: number;
  y: number;
}

export type Dir = 'up' | 'down' | 'left' | 'right';

export const DIR_VEC: Readonly<Record<Dir, Vec>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const OPPOSITE: Readonly<Record<Dir, Dir>> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

/** Timed power-ups. `shrink` is instant, the others last a few seconds. */
export type PowerKind = 'slow' | 'ghost' | 'magnet' | 'double' | 'shrink';
export type TimedPower = Exclude<PowerKind, 'shrink'>;

export type ItemKind = 'apple' | 'golden' | PowerKind;

/** Something lying on the board that the snake can eat. */
export interface Item {
  kind: ItemKind;
  pos: Vec;
  /** Seconds left before it disappears (Infinity for regular apples). */
  ttl: number;
  /** Seconds since spawn — used by the renderer for spawn animation. */
  age: number;
}

/** A pair of linked teleport cells. */
export interface Portal {
  a: Vec;
  b: Vec;
  hue: number;
}

/** Static description of the playfield. */
export interface Board {
  cols: number;
  rows: number;
  /** Blocked cells, stored as `y * cols + x`. */
  walls: Set<number>;
  portals: Portal[];
  /** When true, leaving one edge re-enters from the opposite edge. */
  wrap: boolean;
}

export type ModeId = 'classic' | 'campaign' | 'blitz' | 'zen' | 'daily';

export type Status = 'ready' | 'running' | 'over' | 'won';
export type EndReason = 'wall' | 'self' | 'time' | 'goal';

/** Everything that tunes one run. */
export interface GameConfig {
  mode: ModeId;
  board: Board;
  seed: number;
  startLength: number;
  /** Moves per second at the start of the run. */
  baseSpeed: number;
  /** Moves per second cap. */
  maxSpeed: number;
  /** Moves per second added for every fruit eaten. */
  speedRamp: number;
  /** Fruits required to clear the level (campaign). */
  goal?: number;
  /** Run duration in seconds (blitz). */
  timeLimit?: number;
  /** Whether power-ups can spawn. */
  powerUps: boolean;
}

/** Things that happened during a tick; consumed by renderer, audio and meta. */
export type GameEvent =
  | { type: 'eat'; kind: ItemKind; pos: Vec; points: number; combo: number }
  | { type: 'power'; kind: PowerKind; pos: Vec }
  | { type: 'powerEnd'; kind: TimedPower }
  | { type: 'portal'; from: Vec; to: Vec }
  | { type: 'expire'; kind: ItemKind; pos: Vec }
  | { type: 'die'; pos: Vec; reason: EndReason }
  | { type: 'win' }
  | { type: 'timeUp' };

/** Summary of a finished run, used for rewards, missions and achievements. */
export interface RunStats {
  mode: ModeId;
  score: number;
  fruits: number;
  goldens: number;
  powerUps: number;
  maxCombo: number;
  maxLength: number;
  seconds: number;
  portalsUsed: number;
  reason: EndReason;
  won: boolean;
  levelId?: number;
}

export const cellKey = (x: number, y: number, cols: number): number => y * cols + x;
export const sameCell = (a: Vec, b: Vec): boolean => a.x === b.x && a.y === b.y;
