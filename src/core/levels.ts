import { BoardBuilder, COLS, ROWS } from './board';
import { GameConfig, ModeId } from './types';
import { Rng, hashString } from './rng';

/** An obstacle layout. Patterns draw on an 18x28 board. */
type Pattern = { name: string; draw: (b: BoardBuilder, rng: Rng) => void };

const MIDX = COLS / 2; // 9

export const PATTERNS: readonly Pattern[] = [
  { name: 'Open Field', draw: () => {} },
  {
    name: 'Pillars',
    draw: (b) => {
      for (const y of [4, 12, 20]) b.block(3, y, 2, 2).block(COLS - 5, y, 2, 2);
    },
  },
  {
    name: 'Twin Rails',
    draw: (b) => b.vline(4, 5, 21, [13]).vline(COLS - 5, 5, 21, [13]),
  },
  {
    name: 'Zig Zag',
    draw: (b) => {
      b.hline(0, 11, 5).hline(6, COLS - 1, 10).hline(0, 11, 15);
    },
  },
  {
    name: 'The Box',
    draw: (b) => {
      b.frame(3, 4, COLS - 4, 19);
      // Doors in the middle of every side.
      for (const x of [MIDX - 1, MIDX]) b.clear(x, 4).clear(x, 19);
      for (const y of [11, 12]) b.clear(3, y).clear(COLS - 4, y);
    },
  },
  {
    name: 'Starfield',
    draw: (b) => {
      for (let y = 2; y < ROWS - 2; y += 4) for (let x = 2; x < COLS - 1; x += 4) b.wall(x, y);
    },
  },
  {
    name: 'Four Rooms',
    draw: (b) => {
      b.hline(0, COLS - 1, 13, [3, 4, COLS - 5, COLS - 4]);
      b.vline(MIDX, 0, 12, [6, 7]);
      b.vline(4, 14, ROWS - 1, [20, 21]).vline(COLS - 5, 14, ROWS - 1, [20, 21]);
    },
  },
  {
    name: 'Chevrons',
    draw: (b) => {
      for (let i = 0; i < 6; i++) {
        b.wall(2 + i, 3 + i).wall(COLS - 3 - i, 3 + i);
        b.wall(2 + i, ROWS - 4 - i).wall(COLS - 3 - i, ROWS - 4 - i);
      }
    },
  },
  {
    name: 'Spiral',
    draw: (b) => {
      b.frame(1, 1, COLS - 2, ROWS - 2);
      for (const x of [MIDX - 1, MIDX]) b.clear(x, 1);
      b.frame(4, 4, COLS - 5, 17);
      for (const x of [MIDX - 1, MIDX]) b.clear(x, 17);
    },
  },
  {
    name: 'Diamond',
    draw: (b) => {
      const cx = MIDX - 0.5;
      const cy = 10;
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) {
          const d = Math.abs(x - cx) + Math.abs(y - cy);
          if (d >= 7 && d < 8 && Math.abs(y - cy) > 1.5 && Math.abs(x - cx) > 1) b.wall(x, y);
        }
    },
  },
  {
    name: 'Comb',
    draw: (b) => {
      for (const x of [2, 6, COLS - 7, COLS - 3]) b.vline(x, 0, 8);
      for (const x of [4, COLS - 5]) b.vline(x, 17, ROWS - 1);
    },
  },
  {
    name: 'Asteroids',
    draw: (b, rng) => {
      for (let i = 0; i < 26; i++) {
        const x = rng.int(1, COLS - 2);
        const y = rng.int(1, ROWS - 2);
        b.wall(x, y);
        if (rng.chance(0.4)) b.wall(x + 1, y);
        if (rng.chance(0.3)) b.wall(x, y + 1);
      }
    },
  },
];

/** A campaign level. Stars are awarded for score: 3★ >= stars[0], 2★ >= stars[1]. */
export interface LevelDef {
  id: number; // 1-based
  world: number; // 0-based
  name: string;
  goal: number;
  speed: number;
  portals: number;
  stars: [number, number];
}

export const WORLDS = [
  { name: 'Neon City', hue: 165 },
  { name: 'Crystal Rift', hue: 200 },
  { name: 'The Void', hue: 285 },
] as const;

export const LEVELS_PER_WORLD = PATTERNS.length;

/** The campaign: every pattern appears once per world, each world harder. */
export const LEVELS: readonly LevelDef[] = WORLDS.flatMap((_, world) =>
  PATTERNS.map((pattern, i): LevelDef => {
    const id = world * PATTERNS.length + i + 1;
    const goal = Math.round(8 + id * 0.6);
    return {
      id,
      world,
      name: pattern.name,
      goal,
      speed: 6.5 + world * 1.2 + i * 0.12,
      portals: world,
      // Eating everything at combo x1 gives goal*10; stars need combos.
      stars: [Math.round(goal * 10 * 2.6), Math.round(goal * 10 * 1.6)],
    };
  }),
);

const baseConfig = (mode: ModeId, seed: number): Omit<GameConfig, 'board'> => ({
  mode,
  seed,
  startLength: 4,
  baseSpeed: 7,
  maxSpeed: 16,
  speedRamp: 0.12,
  powerUps: true,
});

/** Builds the config for a single run of any mode. */
export function createConfig(mode: ModeId, opts: { levelId?: number; dateKey?: string; seed?: number } = {}): GameConfig {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);

  switch (mode) {
    case 'classic':
      return { ...baseConfig(mode, seed), board: new BoardBuilder().finish() };

    case 'zen':
      return {
        ...baseConfig(mode, seed),
        baseSpeed: 7,
        maxSpeed: 10,
        speedRamp: 0.05,
        board: new BoardBuilder(COLS, ROWS, true).finish(),
      };

    case 'blitz':
      return {
        ...baseConfig(mode, seed),
        baseSpeed: 8.5,
        maxSpeed: 15,
        speedRamp: 0.1,
        timeLimit: 90,
        board: new BoardBuilder(COLS, ROWS, true).finish(),
      };

    case 'campaign': {
      const level = LEVELS[(opts.levelId ?? 1) - 1] ?? LEVELS[0];
      const rng = new Rng(level.id * 7919);
      const b = new BoardBuilder();
      PATTERNS[(level.id - 1) % PATTERNS.length].draw(b, rng);
      if (level.world === 2) PATTERNS[PATTERNS.length - 1].draw(b, rng); // extra debris in the Void
      b.addPortals(level.portals, rng);
      return {
        ...baseConfig(mode, seed),
        baseSpeed: level.speed,
        maxSpeed: level.speed + 3,
        speedRamp: 0.08,
        goal: level.goal,
        board: b.finish(),
      };
    }

    case 'daily': {
      const daySeed = hashString(`neon-serpent:${opts.dateKey ?? ''}`);
      const rng = new Rng(daySeed);
      const b = new BoardBuilder();
      rng.pick(PATTERNS.slice(1)).draw(b, rng);
      b.addPortals(rng.int(0, 2), rng);
      return { ...baseConfig(mode, daySeed), baseSpeed: 7.5, board: b.finish() };
    }
  }
}

/** Stars earned for a campaign score (0 if the level wasn't completed). */
export function starsFor(level: LevelDef, score: number, won: boolean): number {
  if (!won) return 0;
  if (score >= level.stars[0]) return 3;
  if (score >= level.stars[1]) return 2;
  return 1;
}
