import type { ModeId } from '../core/types';

/** Everything persisted on the device (localStorage, which Capacitor keeps). */
export interface SaveData {
  version: 1;
  coins: number;
  xp: number;
  level: number;
  best: Record<ModeId, number>;
  /** Stars per campaign level, index = levelId - 1. */
  stars: number[];
  skin: string;
  skinsOwned: string[];
  achievements: string[];
  stats: {
    games: number;
    fruits: number;
    goldens: number;
    powerUps: number;
    portals: number;
    seconds: number;
    bestLength: number;
    bestCombo: number;
  };
  missions: { date: string; items: { id: string; progress: number; claimed: boolean }[] };
  daily: { lastDate: string; streak: number; bestToday: number };
  settings: {
    sound: boolean;
    music: boolean;
    haptics: boolean;
    controls: 'swipe' | 'dpad';
  };
}

const KEY = 'neon-serpent/save/v1';

export function defaultSave(): SaveData {
  return {
    version: 1,
    coins: 0,
    xp: 0,
    level: 1,
    best: { classic: 0, campaign: 0, blitz: 0, zen: 0, daily: 0 },
    stars: [],
    skin: 'mint',
    skinsOwned: ['mint'],
    achievements: [],
    stats: { games: 0, fruits: 0, goldens: 0, powerUps: 0, portals: 0, seconds: 0, bestLength: 0, bestCombo: 0 },
    missions: { date: '', items: [] },
    daily: { lastDate: '', streak: 0, bestToday: 0 },
    settings: { sound: true, music: true, haptics: true, controls: 'swipe' },
  };
}

/** Recursively fills keys missing from `value` using `defaults` (forward-compatible saves). */
function withDefaults<T>(defaults: T, value: unknown): T {
  if (Array.isArray(defaults)) return (Array.isArray(value) ? value : defaults) as T;
  if (defaults && typeof defaults === 'object') {
    const src = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const out: Record<string, unknown> = {};
    for (const [k, d] of Object.entries(defaults)) out[k] = withDefaults(d, src[k]);
    return out as T;
  }
  return (typeof value === typeof defaults ? value : defaults) as T;
}

export function loadSave(storage: Pick<Storage, 'getItem'> = localStorage): SaveData {
  try {
    const raw = storage.getItem(KEY);
    return withDefaults(defaultSave(), raw ? JSON.parse(raw) : {});
  } catch {
    return defaultSave();
  }
}

export function writeSave(data: SaveData, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage full or disabled (private mode): the game keeps working in memory.
  }
}
