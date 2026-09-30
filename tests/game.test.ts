import { describe, expect, it } from 'vitest';
import { BoardBuilder, COLS, ROWS, START_HEAD, floodFill } from '../src/core/board';
import { botSteer } from '../src/core/bot';
import { COMBO_WINDOW, Game, POWER_DURATION } from '../src/core/game';
import { LEVELS, createConfig } from '../src/core/levels';
import type { GameConfig, GameEvent, ItemKind } from '../src/core/types';

/** Open classic board with power-ups off, 10 moves/s, no speed ramp. */
function makeGame(overrides: Partial<GameConfig> = {}): Game {
  return new Game({
    mode: 'classic',
    board: new BoardBuilder().finish(),
    seed: 42,
    startLength: 4,
    baseSpeed: 10,
    maxSpeed: 10,
    speedRamp: 0,
    powerUps: false,
    ...overrides,
  });
}

/** Advance exactly `n` moves. */
function moves(game: Game, n: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < n && game.status === 'running'; i++) events.push(...game.update(game.interval + 1e-6));
  return events;
}

/** Put an item directly in front of the head. */
function placeAhead(game: Game, kind: ItemKind, dist = 1): void {
  const h = game.snake[0];
  game.items = [{ kind, pos: { x: h.x, y: h.y - dist }, ttl: Infinity, age: 0 }];
}

describe('Game movement', () => {
  it('waits in "ready" until the first input', () => {
    const g = makeGame();
    g.update(1);
    expect(g.snake[0]).toEqual(START_HEAD);
    g.start();
    moves(g, 1);
    expect(g.snake[0]).toEqual({ x: START_HEAD.x, y: START_HEAD.y - 1 });
  });

  it('ignores reversing into itself', () => {
    const g = makeGame();
    g.steer('down');
    moves(g, 1);
    expect(g.dir).toBe('up');
    expect(g.status).toBe('running');
  });

  it('buffers quick consecutive turns', () => {
    const g = makeGame();
    g.steer('left');
    g.steer('down');
    moves(g, 1);
    expect(g.dir).toBe('left');
    moves(g, 1);
    expect(g.dir).toBe('down');
  });

  it('dies when hitting the outer edge on a walled board', () => {
    const g = makeGame();
    g.start();
    const ev = moves(g, ROWS);
    expect(g.status).toBe('over');
    expect(g.reason).toBe('wall');
    expect(ev.some((e) => e.type === 'die')).toBe(true);
  });

  it('wraps around on a wrap board', () => {
    const g = makeGame({ board: new BoardBuilder(COLS, ROWS, true).finish() });
    g.start();
    g.items = [];
    moves(g, START_HEAD.y + 1);
    expect(g.status).toBe('running');
    expect(g.snake[0].y).toBe(ROWS - 1);
  });

  it('dies when biting itself', () => {
    const g = makeGame({ startLength: 6 });
    g.items = [];
    g.steer('left');
    moves(g, 1);
    g.steer('down');
    moves(g, 1);
    g.steer('right');
    moves(g, 1);
    expect(g.status).toBe('over');
    expect(g.reason).toBe('self');
  });
});

describe('Eating & scoring', () => {
  it('grows by one and scores 10 for an apple', () => {
    const g = makeGame();
    placeAhead(g, 'apple');
    g.start();
    const ev = moves(g, 2);
    expect(g.score).toBe(10);
    expect(g.fruits).toBe(1);
    expect(g.snake.length).toBe(5);
    expect(ev.find((e) => e.type === 'eat')).toMatchObject({ points: 10, combo: 1 });
    // A replacement apple always appears.
    expect(g.items.some((i) => i.kind === 'apple')).toBe(true);
  });

  it('builds a combo when eating within the window, and resets after', () => {
    // Wrap board so the snake can keep going straight while the timer runs.
    const g = makeGame({ board: new BoardBuilder(COLS, ROWS, true).finish() });
    g.start();
    placeAhead(g, 'apple');
    moves(g, 1);
    placeAhead(g, 'apple');
    moves(g, 1);
    expect(g.combo).toBe(2);
    expect(g.score).toBe(10 + 20);
    g.items = [];
    for (let t = 0; t < COMBO_WINDOW + 0.5; t += 0.05) g.update(0.05);
    expect(g.status).toBe('running');
    expect(g.combo).toBe(1);
  });

  it('golden fruit is worth 50 and grows by three', () => {
    const g = makeGame();
    placeAhead(g, 'golden');
    g.start();
    moves(g, 4);
    expect(g.score).toBe(50);
    expect(g.snake.length).toBe(7);
  });

  it('double power doubles points', () => {
    const g = makeGame();
    g.start();
    placeAhead(g, 'double');
    moves(g, 1);
    expect(g.effects.double).toBeCloseTo(POWER_DURATION.double, 0);
    placeAhead(g, 'apple');
    moves(g, 1);
    expect(g.score).toBe(20);
  });

  it('ghost lets the snake pass through itself and the edge', () => {
    const g = makeGame({ startLength: 6 });
    g.start();
    placeAhead(g, 'ghost');
    moves(g, 1);
    g.items = [];
    g.steer('left');
    moves(g, 1);
    g.steer('down');
    moves(g, 1);
    g.steer('right');
    moves(g, 1);
    expect(g.status).toBe('running');
  });

  it('shrink cuts a third of the tail', () => {
    const g = makeGame({ startLength: 12 });
    g.start();
    placeAhead(g, 'shrink');
    moves(g, 1);
    expect(g.snake.length).toBe(8);
  });

  it('slow-mo stretches the move interval', () => {
    const g = makeGame();
    const normal = g.interval;
    g.effects.slow = 5;
    expect(g.interval).toBeGreaterThan(normal * 1.5);
  });
});

describe('Modes', () => {
  it('campaign run is won when the goal is reached', () => {
    const g = makeGame({ goal: 1 });
    placeAhead(g, 'apple');
    g.start();
    const ev = moves(g, 1);
    expect(g.status).toBe('won');
    expect(ev.some((e) => e.type === 'win')).toBe(true);
  });

  it('blitz ends when time runs out', () => {
    const g = makeGame({ board: new BoardBuilder(COLS, ROWS, true).finish(), timeLimit: 1 });
    g.start();
    for (let i = 0; i < 30; i++) g.update(0.05);
    expect(g.status).toBe('over');
    expect(g.reason).toBe('time');
  });

  it('portals teleport the head', () => {
    const b = new BoardBuilder();
    b.portals.push({ a: { x: START_HEAD.x, y: START_HEAD.y - 2 }, b: { x: 3, y: 5 }, hue: 0 });
    const g = makeGame({ board: b.finish() });
    g.items = [];
    g.start();
    const ev = moves(g, 2);
    expect(ev.some((e) => e.type === 'portal')).toBe(true);
    expect(g.snake[0]).toEqual({ x: 3, y: 4 });
  });

  it('every campaign level has a reachable, clear start', () => {
    for (const level of LEVELS) {
      const cfg = createConfig('campaign', { levelId: level.id, seed: 1 });
      const open = cfg.board.cols * cfg.board.rows - cfg.board.walls.size;
      expect(open, `level ${level.id}`).toBeGreaterThan(200);
      expect(floodFill(cfg.board, START_HEAD).size).toBe(open);
      const g = new Game(cfg);
      expect(g.items.length).toBe(1);
    }
  });

  it('daily config is identical for the same date', () => {
    const a = createConfig('daily', { dateKey: '2026-09-30' });
    const b = createConfig('daily', { dateKey: '2026-09-30' });
    expect([...a.board.walls]).toEqual([...b.board.walls]);
    expect(a.seed).toBe(b.seed);
  });
});

describe('Bot', () => {
  it('survives a while and eats fruit on an open board', () => {
    const g = makeGame({ board: new BoardBuilder(COLS, ROWS, true).finish() });
    g.start();
    for (let i = 0; i < 400 && g.status === 'running'; i++) {
      botSteer(g);
      moves(g, 1);
    }
    expect(g.fruits).toBeGreaterThan(5);
  });
});
