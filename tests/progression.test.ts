import { describe, expect, it } from 'vitest';
import type { RunStats } from '../src/core/types';
import { applyRun, currentMissions, missionsFor, unlockedLevel, xpToNext } from '../src/meta/progression';
import { defaultSave, loadSave, writeSave } from '../src/meta/storage';

const run = (over: Partial<RunStats> = {}): RunStats => ({
  mode: 'classic', score: 0, fruits: 0, goldens: 0, powerUps: 0, maxCombo: 1,
  maxLength: 4, seconds: 10, portalsUsed: 0, reason: 'wall', won: false, ...over,
});

describe('applyRun', () => {
  it('records bests, coins and xp', () => {
    const save = defaultSave();
    const r = applyRun(save, run({ score: 450, fruits: 20 }), '2026-09-30');
    expect(save.best.classic).toBe(450);
    expect(r.newBest).toBe(true);
    expect(r.coins).toBeGreaterThanOrEqual(45);
    expect(save.coins).toBe(r.coins);
    expect(save.stats.fruits).toBe(20);
    expect(r.achievements.map((a) => a.id)).toContain('first');
  });

  it('levels up when xp overflows', () => {
    const save = defaultSave();
    const r = applyRun(save, run({ score: 2000, fruits: 50, seconds: 200 }), '2026-09-30');
    expect(r.levelUps).toBeGreaterThan(0);
    expect(save.xp).toBeLessThan(xpToNext(save.level));
  });

  it('awards campaign stars and unlocks the next level', () => {
    const save = defaultSave();
    expect(unlockedLevel(save)).toBe(1);
    const r = applyRun(save, run({ mode: 'campaign', levelId: 1, won: true, score: 9999, fruits: 9, reason: 'goal' }), '2026-09-30');
    expect(r.stars).toBe(3);
    expect(save.stars[0]).toBe(3);
    expect(unlockedLevel(save)).toBe(2);
  });

  it('tracks the daily streak across consecutive days', () => {
    const save = defaultSave();
    applyRun(save, run({ mode: 'daily' }), '2026-09-28');
    applyRun(save, run({ mode: 'daily' }), '2026-09-29');
    applyRun(save, run({ mode: 'daily' }), '2026-09-29');
    expect(save.daily.streak).toBe(2);
    applyRun(save, run({ mode: 'daily' }), '2026-10-02');
    expect(save.daily.streak).toBe(1);
  });

  it('progresses and completes daily missions', () => {
    const save = defaultSave();
    const date = '2026-09-30';
    const ms = currentMissions(save, date);
    expect(ms).toHaveLength(3);
    // A huge run completes every mission type at once.
    const r = applyRun(save, run({ score: 5000, fruits: 100, goldens: 10, powerUps: 10, maxCombo: 8, maxLength: 60, seconds: 300, portalsUsed: 20 }), date);
    applyRun(save, run(), date);
    applyRun(save, run(), date);
    const after = currentMissions(save, date);
    expect(r.missions.length).toBeGreaterThan(0);
    expect(after.filter((m) => m.claimed).length).toBeGreaterThanOrEqual(2);
  });

  it('missions are deterministic per date', () => {
    expect(missionsFor('2026-01-01')).toEqual(missionsFor('2026-01-01'));
  });
});

describe('storage', () => {
  it('round-trips and fills defaults for old saves', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const save = defaultSave();
    save.coins = 123;
    writeSave(save, store);
    expect(loadSave(store).coins).toBe(123);

    mem.set('neon-serpent/save/v1', JSON.stringify({ coins: 5 }));
    const loaded = loadSave(store);
    expect(loaded.coins).toBe(5);
    expect(loaded.settings.sound).toBe(true);
    expect(loaded.skinsOwned).toEqual(['mint']);
  });

  it('survives corrupted data', () => {
    const store = { getItem: () => '{not json' };
    expect(loadSave(store).coins).toBe(0);
  });
});
