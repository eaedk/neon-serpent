import type { Game } from './game';
import { DIR_VEC, Dir, OPPOSITE, Vec, cellKey } from './types';

const DIRS: readonly Dir[] = ['up', 'left', 'right', 'down'];

/**
 * A tiny autopilot used for the animated menu background.
 * It takes the shortest path to the nearest fruit (BFS) and, when there is
 * none, picks the neighbour with the most open space around it.
 */
export function botSteer(game: Game): void {
  if (game.pendingTurns > 0) return; // already decided for the next move
  const { cols, rows, walls, wrap, portals } = game.board;
  const blocked = new Set<number>(walls);
  for (const p of portals) blocked.add(cellKey(p.a.x, p.a.y, cols)).add(cellKey(p.b.x, p.b.y, cols));
  // The tail frees up as we move, so ignore the last segment.
  for (const s of game.snake.slice(0, -1)) blocked.add(cellKey(s.x, s.y, cols));

  const step = (p: Vec, d: Dir): Vec | null => {
    let x = p.x + DIR_VEC[d].x;
    let y = p.y + DIR_VEC[d].y;
    if (wrap) {
      x = (x + cols) % cols;
      y = (y + rows) % rows;
    } else if (x < 0 || y < 0 || x >= cols || y >= rows) return null;
    return blocked.has(cellKey(x, y, cols)) ? null : { x, y };
  };

  const head = game.snake[0];
  const targets = new Set(game.items.filter((i) => i.kind !== 'shrink').map((i) => cellKey(i.pos.x, i.pos.y, cols)));
  const firstDir = new Map<number, Dir>();
  const queue: Vec[] = [];
  for (const d of DIRS) {
    if (d === OPPOSITE[game.dir]) continue;
    const n = step(head, d);
    if (!n) continue;
    const k = cellKey(n.x, n.y, cols);
    if (firstDir.has(k)) continue;
    firstDir.set(k, d);
    queue.push(n);
  }

  // BFS toward the closest item, remembering the first move of each path.
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    const k = cellKey(cur.x, cur.y, cols);
    if (targets.has(k) && openSpace(cur, step, cols) > game.snake.length) {
      game.steer(firstDir.get(k)!);
      return;
    }
    for (const d of DIRS) {
      const n = step(cur, d);
      if (!n) continue;
      const nk = cellKey(n.x, n.y, cols);
      if (firstDir.has(nk)) continue;
      firstDir.set(nk, firstDir.get(k)!);
      queue.push(n);
    }
  }

  // No safe path: survive as long as possible.
  let best: Dir | null = null;
  let bestSpace = -1;
  for (const d of DIRS) {
    if (d === OPPOSITE[game.dir]) continue;
    const n = step(head, d);
    if (!n) continue;
    const space = openSpace(n, step, cols);
    if (space > bestSpace) {
      bestSpace = space;
      best = d;
    }
  }
  if (best) game.steer(best);
}

/** Number of cells reachable from `from` (capped for speed). */
function openSpace(from: Vec, step: (p: Vec, d: Dir) => Vec | null, cols: number, cap = 200): number {
  const seen = new Set<number>([cellKey(from.x, from.y, cols)]);
  const stack = [from];
  while (stack.length && seen.size < cap) {
    const cur = stack.pop()!;
    for (const d of DIRS) {
      const n = step(cur, d);
      if (!n) continue;
      const k = cellKey(n.x, n.y, cols);
      if (!seen.has(k)) {
        seen.add(k);
        stack.push(n);
      }
    }
  }
  return seen.size;
}
