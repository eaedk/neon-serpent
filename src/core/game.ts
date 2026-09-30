import { START_HEAD } from './board';
import { Rng } from './rng';
import {
  Board,
  DIR_VEC,
  Dir,
  EndReason,
  GameConfig,
  GameEvent,
  Item,
  ItemKind,
  OPPOSITE,
  PowerKind,
  RunStats,
  Status,
  TimedPower,
  Vec,
  cellKey,
  sameCell,
} from './types';

/** Seconds you have to eat the next fruit to keep a combo going. */
export const COMBO_WINDOW = 4;
export const MAX_COMBO = 8;
/** Slow-mo stretches the move interval by this factor. */
export const SLOW_FACTOR = 1.6;
export const POWER_DURATION: Readonly<Record<TimedPower, number>> = {
  slow: 8,
  ghost: 7,
  magnet: 10,
  double: 10,
};
const POWER_KINDS: readonly PowerKind[] = ['slow', 'ghost', 'magnet', 'double', 'shrink'];
const POINTS: Readonly<Record<'apple' | 'golden', number>> = { apple: 10, golden: 50 };
const SHRINK_BONUS = 25;
const MAGNET_RADIUS = 6;
const MAX_QUEUED_TURNS = 3;

/**
 * One run of the game. Fixed-timestep simulation: call `update(dt)` every
 * frame, it advances whole moves and returns what happened so the caller can
 * play sounds, spawn particles, etc. Rendering uses `prevSnake`, `snake` and
 * `alpha` to interpolate smoothly between moves.
 */
export class Game {
  readonly cfg: GameConfig;
  readonly board: Board;

  /** Head first. */
  snake: Vec[];
  /** Snake as it was before the latest move (for interpolation). */
  prevSnake: Vec[];
  dir: Dir = 'up';
  items: Item[] = [];
  status: Status = 'ready';
  reason: EndReason | null = null;

  score = 0;
  fruits = 0;
  combo = 1;
  /** Seconds left before the combo resets. */
  comboTimer = 0;
  /** Seconds left on each timed power-up (0 = inactive). */
  effects: Record<TimedPower, number> = { slow: 0, ghost: 0, magnet: 0, double: 0 };
  /** Seconds of play time (excludes pauses and the "ready" phase). */
  elapsed = 0;

  private readonly rng: Rng;
  private readonly queue: Dir[] = [];
  private acc = 0;
  private growth = 0;
  private goldens = 0;
  private powerUpsTaken = 0;
  private maxCombo = 1;
  private maxLength: number;
  private portalsUsed = 0;
  private fruitsSincePower = 0;
  private nextPowerAt: number;

  constructor(cfg: GameConfig) {
    this.cfg = cfg;
    this.board = cfg.board;
    this.rng = new Rng(cfg.seed);
    this.snake = Array.from({ length: cfg.startLength }, (_, i) => ({ x: START_HEAD.x, y: START_HEAD.y + i }));
    this.prevSnake = this.snake.slice();
    this.maxLength = this.snake.length;
    this.nextPowerAt = this.powerGap();
    this.spawn('apple', Infinity);
  }

  // ---------------------------------------------------------------- queries

  /** Moves per second right now. */
  get speed(): number {
    return Math.min(this.cfg.maxSpeed, this.cfg.baseSpeed + this.fruits * this.cfg.speedRamp);
  }

  /** Seconds between two moves, including slow-mo. */
  get interval(): number {
    return (1 / this.speed) * (this.effects.slow > 0 ? SLOW_FACTOR : 1);
  }

  /** Progress (0..1) between the previous and the next move. */
  get alpha(): number {
    return this.status === 'running' ? Math.min(1, this.acc / this.interval) : 1;
  }

  /** Seconds left in timed modes, or null. */
  get timeLeft(): number | null {
    return this.cfg.timeLimit ? Math.max(0, this.cfg.timeLimit - this.elapsed) : null;
  }

  get multiplier(): number {
    return this.combo * (this.effects.double > 0 ? 2 : 1);
  }

  /** Turns buffered but not yet applied. */
  get pendingTurns(): number {
    return this.queue.length;
  }

  get isOver(): boolean {
    return this.status === 'over' || this.status === 'won';
  }

  stats(): RunStats {
    return {
      mode: this.cfg.mode,
      score: this.score,
      fruits: this.fruits,
      goldens: this.goldens,
      powerUps: this.powerUpsTaken,
      maxCombo: this.maxCombo,
      maxLength: this.maxLength,
      seconds: this.elapsed,
      portalsUsed: this.portalsUsed,
      reason: this.reason ?? 'wall',
      won: this.status === 'won',
    };
  }

  // ---------------------------------------------------------------- input

  /**
   * Queues a turn. Turns are buffered so quick swipes (e.g. a U-turn done as
   * two swipes) are not lost between moves. The first input starts the run.
   */
  steer(d: Dir): void {
    if (this.isOver) return;
    if (this.status === 'ready') this.status = 'running';
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if (d === last || d === OPPOSITE[last]) return;
    if (this.queue.length < MAX_QUEUED_TURNS) this.queue.push(d);
  }

  /** Starts the run without turning (e.g. a tap). */
  start(): void {
    if (this.status === 'ready') this.status = 'running';
  }

  // ---------------------------------------------------------------- simulation

  /** Advances the simulation by `dt` seconds of real time. */
  update(dt: number): GameEvent[] {
    const events: GameEvent[] = [];
    if (this.status !== 'running') return events;
    dt = Math.min(dt, 0.1); // avoid a burst of moves after a hitch

    this.elapsed += dt;
    this.tickTimers(dt, events);
    if (this.cfg.timeLimit && this.elapsed >= this.cfg.timeLimit) {
      this.status = 'over';
      this.reason = 'time';
      events.push({ type: 'timeUp' });
      return events;
    }

    this.acc += dt;
    while (this.status === 'running' && this.acc >= this.interval) {
      this.acc -= this.interval;
      this.move(events);
    }
    return events;
  }

  private tickTimers(dt: number, events: GameEvent[]): void {
    for (const k of Object.keys(this.effects) as TimedPower[]) {
      if (this.effects[k] <= 0) continue;
      this.effects[k] = Math.max(0, this.effects[k] - dt);
      if (this.effects[k] === 0) events.push({ type: 'powerEnd', kind: k });
    }
    if (this.comboTimer > 0) {
      this.comboTimer = Math.max(0, this.comboTimer - dt);
      if (this.comboTimer === 0) this.combo = 1;
    }
    for (const item of this.items) item.age += dt;
    const expired = this.items.filter((i) => (i.ttl -= dt) <= 0);
    for (const item of expired) {
      this.items.splice(this.items.indexOf(item), 1);
      events.push({ type: 'expire', kind: item.kind, pos: item.pos });
    }
  }

  /** One grid step. */
  private move(events: GameEvent[]): void {
    this.prevSnake = this.snake.slice();
    const turn = this.queue.shift();
    if (turn) this.dir = turn;

    const head = this.snake[0];
    const dv = DIR_VEC[this.dir];
    let next = this.resolveEdges({ x: head.x + dv.x, y: head.y + dv.y });

    const portal = next && this.portalExit(next);
    if (next && portal) {
      const from = next;
      next = this.resolveEdges({ x: portal.x + dv.x, y: portal.y + dv.y });
      this.portalsUsed++;
      events.push({ type: 'portal', from, to: portal });
    }

    if (!next || this.board.walls.has(cellKey(next.x, next.y, this.board.cols))) {
      return this.die('wall', next ?? head, events);
    }

    const item = this.items.find((i) => sameCell(i.pos, next!));
    if (item?.kind === 'apple') this.growth += 1;
    if (item?.kind === 'golden') this.growth += 3;

    // The tail cell frees up this move unless we're growing.
    const body = this.growth > 0 ? this.snake : this.snake.slice(0, -1);
    if (this.effects.ghost <= 0 && body.some((s) => sameCell(s, next!))) {
      return this.die('self', next, events);
    }

    this.snake.unshift(next);
    if (this.growth > 0) this.growth--;
    else this.snake.pop();
    this.maxLength = Math.max(this.maxLength, this.snake.length);

    if (item) this.consume(item, events);
    if (this.effects.magnet > 0) this.pullItems(events);

    if (this.cfg.goal && this.fruits >= this.cfg.goal && this.status === 'running') {
      this.status = 'won';
      this.reason = 'goal';
      events.push({ type: 'win' });
    }
  }

  private consume(item: Item, events: GameEvent[]): void {
    this.items.splice(this.items.indexOf(item), 1);

    if (item.kind === 'apple' || item.kind === 'golden') {
      this.combo = this.comboTimer > 0 ? Math.min(MAX_COMBO, this.combo + 1) : 1;
      this.comboTimer = COMBO_WINDOW;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const points = POINTS[item.kind] * this.multiplier;
      this.score += points;
      this.fruits++;
      if (item.kind === 'golden') this.goldens++;
      events.push({ type: 'eat', kind: item.kind, pos: item.pos, points, combo: this.combo });
      if (item.kind === 'apple') this.afterApple();
      return;
    }

    this.powerUpsTaken++;
    if (item.kind === 'shrink') {
      const keep = Math.max(3, this.snake.length - Math.floor(this.snake.length / 3));
      this.snake.length = keep;
      this.growth = 0;
      this.score += SHRINK_BONUS;
    } else {
      this.effects[item.kind] = POWER_DURATION[item.kind];
    }
    events.push({ type: 'power', kind: item.kind, pos: item.pos });
  }

  /** Replace the apple and occasionally drop a bonus. */
  private afterApple(): void {
    this.spawn('apple', Infinity);
    const blitz = this.cfg.mode === 'blitz';
    if (!this.items.some((i) => i.kind === 'golden') && this.rng.chance(blitz ? 0.2 : 0.1)) {
      this.spawn('golden', 6);
    }
    if (!this.cfg.powerUps) return;
    this.fruitsSincePower++;
    const hasPower = this.items.some((i) => i.kind !== 'apple' && i.kind !== 'golden');
    if (!hasPower && this.fruitsSincePower >= this.nextPowerAt) {
      this.spawn(this.rng.pick(POWER_KINDS), 9);
      this.fruitsSincePower = 0;
      this.nextPowerAt = this.powerGap();
    }
  }

  private powerGap(): number {
    return this.cfg.mode === 'blitz' ? this.rng.int(3, 5) : this.rng.int(5, 8);
  }

  /** Magnet: fruit within range drifts one cell toward the head per move. */
  private pullItems(events: GameEvent[]): void {
    const head = this.snake[0];
    for (const item of this.items.slice()) {
      if (item.kind !== 'apple' && item.kind !== 'golden') continue;
      const dx = head.x - item.pos.x;
      const dy = head.y - item.pos.y;
      if (Math.abs(dx) + Math.abs(dy) > MAGNET_RADIUS) continue;
      const step =
        Math.abs(dx) >= Math.abs(dy) ? { x: item.pos.x + Math.sign(dx), y: item.pos.y } : { x: item.pos.x, y: item.pos.y + Math.sign(dy) };
      if (sameCell(step, head)) {
        if (item.kind === 'apple') this.growth += 1;
        else this.growth += 3;
        this.consume(item, events);
      } else if (this.isFree(step)) {
        item.pos = step;
      }
    }
  }

  private die(reason: EndReason, pos: Vec, events: GameEvent[]): void {
    this.snake = this.prevSnake;
    this.status = 'over';
    this.reason = reason;
    events.push({ type: 'die', pos, reason });
  }

  // ---------------------------------------------------------------- board helpers

  /** Applies wrap-around. Returns null when the move would leave the board. */
  private resolveEdges(p: Vec): Vec | null {
    const { cols, rows } = this.board;
    if (p.x >= 0 && p.y >= 0 && p.x < cols && p.y < rows) return p;
    if (!this.board.wrap && this.effects.ghost <= 0) return null;
    return { x: (p.x + cols) % cols, y: (p.y + rows) % rows };
  }

  /** If `p` is a portal mouth, the linked mouth; otherwise null. */
  private portalExit(p: Vec): Vec | null {
    for (const portal of this.board.portals) {
      if (sameCell(p, portal.a)) return portal.b;
      if (sameCell(p, portal.b)) return portal.a;
    }
    return null;
  }

  private isFree(p: Vec): boolean {
    const { cols, rows, walls, portals } = this.board;
    if (p.x < 0 || p.y < 0 || p.x >= cols || p.y >= rows) return false;
    if (walls.has(cellKey(p.x, p.y, cols))) return false;
    if (portals.some((q) => sameCell(q.a, p) || sameCell(q.b, p))) return false;
    if (this.items.some((i) => sameCell(i.pos, p))) return false;
    return !this.snake.some((s) => sameCell(s, p));
  }

  /** Drops an item on a random free cell, away from the head. */
  private spawn(kind: ItemKind, ttl: number): void {
    const head = this.snake[0];
    const free: Vec[] = [];
    for (let y = 0; y < this.board.rows; y++) {
      for (let x = 0; x < this.board.cols; x++) {
        const p = { x, y };
        if (Math.abs(x - head.x) + Math.abs(y - head.y) < 3) continue;
        if (this.isFree(p)) free.push(p);
      }
    }
    if (free.length) this.items.push({ kind, pos: this.rng.pick(free), ttl, age: 0 });
  }
}
