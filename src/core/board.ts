import { Board, Portal, Vec, cellKey } from './types';
import { Rng } from './rng';

/** Logical playfield size, shared by every mode (portrait phones). */
export const COLS = 18;
export const ROWS = 28;

/** Where every run starts: the head, with the body trailing below it. */
export const START_HEAD: Vec = { x: Math.floor(COLS / 2), y: ROWS - 7 };

/**
 * Builds a `Board` with drawing helpers for obstacle patterns.
 * `finish()` makes sure the start is clear and that every open cell can be
 * reached, so food never spawns somewhere the player can't get to.
 */
export class BoardBuilder {
  readonly walls = new Set<number>();
  readonly portals: Portal[] = [];

  constructor(
    readonly cols = COLS,
    readonly rows = ROWS,
    readonly wrap = false,
  ) {}

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  wall(x: number, y: number): this {
    if (this.inBounds(x, y)) this.walls.add(cellKey(x, y, this.cols));
    return this;
  }

  /** Solid rectangle. */
  block(x: number, y: number, w: number, h: number): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.wall(x + i, y + j);
    return this;
  }

  /** Horizontal line from x1 to x2 inclusive, skipping any x in `gaps`. */
  hline(x1: number, x2: number, y: number, gaps: number[] = []): this {
    for (let x = x1; x <= x2; x++) if (!gaps.includes(x)) this.wall(x, y);
    return this;
  }

  /** Vertical line from y1 to y2 inclusive, skipping any y in `gaps`. */
  vline(x: number, y1: number, y2: number, gaps: number[] = []): this {
    for (let y = y1; y <= y2; y++) if (!gaps.includes(y)) this.wall(x, y);
    return this;
  }

  /** Rectangle outline. */
  frame(x1: number, y1: number, x2: number, y2: number): this {
    return this.hline(x1, x2, y1).hline(x1, x2, y2).vline(x1, y1, y2).vline(x2, y1, y2);
  }

  clear(x: number, y: number): this {
    this.walls.delete(cellKey(x, y, this.cols));
    return this;
  }

  isWall(x: number, y: number): boolean {
    return this.walls.has(cellKey(x, y, this.cols));
  }

  /** Adds `count` portal pairs on open cells whose neighbours are also open. */
  addPortals(count: number, rng: Rng): this {
    const hues = [285, 190, 40];
    const taken: Vec[] = [];
    const ok = (p: Vec): boolean => {
      if (p.x < 2 || p.y < 2 || p.x > this.cols - 3 || p.y > this.rows - 3) return false;
      if (Math.abs(p.x - START_HEAD.x) <= 2 && p.y >= START_HEAD.y - 6) return false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) if (this.isWall(p.x + dx, p.y + dy)) return false;
      return taken.every((t) => Math.abs(t.x - p.x) + Math.abs(t.y - p.y) > 5);
    };
    for (let n = 0; n < count; n++) {
      const ends: Vec[] = [];
      for (let attempt = 0; attempt < 400 && ends.length < 2; attempt++) {
        const p = { x: rng.int(0, this.cols - 1), y: rng.int(0, this.rows - 1) };
        // Keep the two ends of a pair far apart so teleporting is meaningful.
        if (ends.length === 1 && Math.abs(ends[0].x - p.x) + Math.abs(ends[0].y - p.y) < 12) continue;
        if (ok(p)) {
          ends.push(p);
          taken.push(p);
        }
      }
      if (ends.length === 2) this.portals.push({ a: ends[0], b: ends[1], hue: hues[n % hues.length] });
    }
    return this;
  }

  /** Finalises the board: clears the spawn lane and opens any sealed-off pockets. */
  finish(startLength = 4): Board {
    // Spawn lane: the snake's body plus a few cells of runway ahead of it.
    for (let y = START_HEAD.y - 5; y <= START_HEAD.y + startLength; y++) {
      for (let x = START_HEAD.x - 1; x <= START_HEAD.x + 1; x++) this.clear(x, y);
    }
    for (const p of this.portals) this.clear(p.a.x, p.a.y).clear(p.b.x, p.b.y);

    const board: Board = {
      cols: this.cols,
      rows: this.rows,
      walls: this.walls,
      portals: this.portals,
      wrap: this.wrap,
    };
    // Random debris can close corridors. Rather than filling the cut-off area
    // with walls, carve the shortest tunnel to it. Repeat until all open
    // cells are connected (each pass connects at least one pocket).
    for (let pass = 0; pass < this.cols * this.rows; pass++) {
      const reachable = floodFill(board, START_HEAD);
      if (reachable.size + this.walls.size >= this.cols * this.rows) break;
      this.carveToPocket(reachable);
    }
    return board;
  }

  /** BFS from the reachable area *through walls* to the nearest unreachable open cell, clearing the path. */
  private carveToPocket(reachable: Set<number>): void {
    const { cols, rows } = this;
    const parent = new Map<number, number>();
    const seen = new Set(reachable);
    const queue = [...reachable];
    for (let i = 0; i < queue.length; i++) {
      const k = queue[i];
      const x = k % cols;
      const y = Math.floor(k / cols);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let nx = x + dx;
        let ny = y + dy;
        if (this.wrap) {
          nx = (nx + cols) % cols;
          ny = (ny + rows) % rows;
        } else if (!this.inBounds(nx, ny)) continue;
        const n = cellKey(nx, ny, cols);
        if (seen.has(n)) continue;
        seen.add(n);
        parent.set(n, k);
        if (!this.walls.has(n)) {
          // Reached a pocket: knock down the walls on the way back.
          for (let c = parent.get(n); c !== undefined && this.walls.has(c); c = parent.get(c)) this.walls.delete(c);
          return;
        }
        queue.push(n);
      }
    }
  }
}

/** Cells reachable from `from`, honouring wrap-around and portals. */
export function floodFill(board: Board, from: Vec): Set<number> {
  const { cols, rows } = board;
  const seen = new Set<number>();
  const stack: Vec[] = [from];
  const portalExit = new Map<number, Vec>();
  for (const p of board.portals) {
    portalExit.set(cellKey(p.a.x, p.a.y, cols), p.b);
    portalExit.set(cellKey(p.b.x, p.b.y, cols), p.a);
  }
  while (stack.length) {
    let { x, y } = stack.pop()!;
    if (board.wrap) {
      x = (x + cols) % cols;
      y = (y + rows) % rows;
    } else if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
    const k = cellKey(x, y, cols);
    if (seen.has(k) || board.walls.has(k)) continue;
    seen.add(k);
    const exit = portalExit.get(k);
    if (exit) stack.push(exit);
    stack.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
  }
  return seen;
}
