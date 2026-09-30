import { LEVELS, starsFor } from '../core/levels';
import { Rng, hashString, todayKey } from '../core/rng';
import type { RunStats } from '../core/types';
import { SKINS } from './skins';
import type { SaveData } from './storage';

// ------------------------------------------------------------------ levels & XP

/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level: number): number => 100 + (level - 1) * 45;

// ------------------------------------------------------------------ achievements

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  reward: number;
  /** `run` is the run that just ended; `save` already includes it. */
  test: (save: SaveData, run: RunStats) => boolean;
}

const campaignDone = (save: SaveData, upTo: number): boolean =>
  save.stars.length >= upTo && save.stars.slice(0, upTo).every((s) => s > 0);
const totalStars = (save: SaveData): number => save.stars.reduce((a, b) => a + b, 0);

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first', title: 'First Bite', desc: 'Eat your first fruit', reward: 20, test: (s) => s.stats.fruits >= 1 },
  { id: 'combo5', title: 'On Fire', desc: 'Reach a x5 combo', reward: 60, test: (_, r) => r.maxCombo >= 5 },
  { id: 'combo8', title: 'Unstoppable', desc: 'Reach the max x8 combo', reward: 150, test: (_, r) => r.maxCombo >= 8 },
  { id: 'len30', title: 'Long Boi', desc: 'Grow to length 30', reward: 60, test: (_, r) => r.maxLength >= 30 },
  { id: 'len60', title: 'Megaserpent', desc: 'Grow to length 60', reward: 200, test: (_, r) => r.maxLength >= 60 },
  { id: 'score500', title: 'Warming Up', desc: 'Score 500 in one run', reward: 40, test: (_, r) => r.score >= 500 },
  { id: 'score2k', title: 'High Roller', desc: 'Score 2,000 in one run', reward: 120, test: (_, r) => r.score >= 2000 },
  { id: 'score5k', title: 'Legend', desc: 'Score 5,000 in one run', reward: 300, test: (_, r) => r.score >= 5000 },
  { id: 'golden10', title: 'Gold Digger', desc: 'Eat 10 golden fruits', reward: 80, test: (s) => s.stats.goldens >= 10 },
  { id: 'power50', title: 'Power Hungry', desc: 'Collect 50 power-ups', reward: 120, test: (s) => s.stats.powerUps >= 50 },
  { id: 'portal', title: 'Wormhole', desc: 'Travel through a portal', reward: 30, test: (_, r) => r.portalsUsed > 0 },
  { id: 'blitz1k', title: 'Speed Demon', desc: 'Score 1,000 in Blitz', reward: 120, test: (_, r) => r.mode === 'blitz' && r.score >= 1000 },
  { id: 'zen10', title: 'Inner Peace', desc: 'Play 10 minutes in one Zen run', reward: 120, test: (_, r) => r.mode === 'zen' && r.seconds >= 600 },
  { id: 'world1', title: 'City Lights', desc: 'Clear Neon City', reward: 150, test: (s) => campaignDone(s, 12) },
  { id: 'world2', title: 'Crystal Clear', desc: 'Clear Crystal Rift', reward: 250, test: (s) => campaignDone(s, 24) },
  { id: 'world3', title: 'Into the Void', desc: 'Clear the whole campaign', reward: 500, test: (s) => campaignDone(s, LEVELS.length) },
  { id: 'stars', title: 'Perfectionist', desc: `Earn all ${LEVELS.length * 3} stars`, reward: 1000, test: (s) => totalStars(s) >= LEVELS.length * 3 },
  { id: 'streak7', title: 'Devoted', desc: '7-day Daily Challenge streak', reward: 300, test: (s) => s.daily.streak >= 7 },
  { id: 'fruits1k', title: 'Fruit Fiend', desc: 'Eat 1,000 fruits', reward: 250, test: (s) => s.stats.fruits >= 1000 },
  { id: 'hour', title: 'Marathon', desc: 'Play for a total of 1 hour', reward: 200, test: (s) => s.stats.seconds >= 3600 },
  { id: 'skins5', title: 'Fashionista', desc: 'Own 5 skins', reward: 150, test: (s) => s.skinsOwned.length >= 5 },
  { id: 'allskins', title: 'Collector', desc: 'Own every skin', reward: 500, test: (s) => s.skinsOwned.length >= SKINS.length },
];

// ------------------------------------------------------------------ daily missions

interface MissionTemplate {
  id: string;
  targets: number[];
  text: (n: number) => string;
  /** 'sum' accumulates over runs, 'best' needs it in a single run. */
  kind: 'sum' | 'best';
  metric: (r: RunStats) => number;
}

const MISSION_TEMPLATES: readonly MissionTemplate[] = [
  { id: 'fruits', targets: [30, 50, 80], kind: 'sum', text: (n) => `Eat ${n} fruits`, metric: (r) => r.fruits },
  { id: 'combo', targets: [4, 5, 6], kind: 'best', text: (n) => `Reach a x${n} combo`, metric: (r) => r.maxCombo },
  { id: 'score', targets: [300, 600, 1000], kind: 'best', text: (n) => `Score ${n} in one run`, metric: (r) => r.score },
  { id: 'powers', targets: [3, 5, 8], kind: 'sum', text: (n) => `Collect ${n} power-ups`, metric: (r) => r.powerUps },
  { id: 'games', targets: [3, 5, 8], kind: 'sum', text: (n) => `Play ${n} games`, metric: () => 1 },
  { id: 'length', targets: [15, 25, 35], kind: 'best', text: (n) => `Reach length ${n}`, metric: (r) => r.maxLength },
  { id: 'golden', targets: [2, 3, 5], kind: 'sum', text: (n) => `Eat ${n} golden fruits`, metric: (r) => r.goldens },
  { id: 'survive', targets: [60, 90, 150], kind: 'best', text: (n) => `Survive ${n}s in one run`, metric: (r) => Math.floor(r.seconds) },
  { id: 'blitz', targets: [200, 400, 700], kind: 'best', text: (n) => `Score ${n} in Blitz`, metric: (r) => (r.mode === 'blitz' ? r.score : 0) },
];

export interface Mission {
  id: string; // `${templateId}:${target}`
  text: string;
  target: number;
  reward: number;
  progress: number;
  claimed: boolean;
}

/** The 3 missions of a given day; identical for everyone on that date. */
export function missionsFor(date: string): Omit<Mission, 'progress' | 'claimed'>[] {
  const rng = new Rng(hashString(`missions:${date}`));
  const pool = MISSION_TEMPLATES.slice();
  return [0, 1, 2].map((tier) => {
    const t = pool.splice(rng.int(0, pool.length - 1), 1)[0];
    const target = t.targets[tier];
    return { id: `${t.id}:${target}`, text: t.text(target), target, reward: 60 + tier * 45 };
  });
}

/** Today's missions merged with saved progress (resets on a new day). */
export function currentMissions(save: SaveData, date = todayKey()): Mission[] {
  if (save.missions.date !== date) {
    save.missions = { date, items: missionsFor(date).map((m) => ({ id: m.id, progress: 0, claimed: false })) };
  }
  return missionsFor(date).map((m) => {
    const s = save.missions.items.find((i) => i.id === m.id) ?? { progress: 0, claimed: false };
    return { ...m, progress: s.progress, claimed: s.claimed };
  });
}

// ------------------------------------------------------------------ applying a run

export interface RunRewards {
  coins: number;
  xp: number;
  levelUps: number;
  newBest: boolean;
  stars: number;
  previousStars: number;
  achievements: Achievement[];
  missions: Mission[];
}

/**
 * Folds a finished run into the save: stats, bests, stars, XP, coins,
 * mission progress and newly unlocked achievements. Mutates `save`.
 */
export function applyRun(save: SaveData, run: RunStats, date = todayKey()): RunRewards {
  const st = save.stats;
  st.games++;
  st.fruits += run.fruits;
  st.goldens += run.goldens;
  st.powerUps += run.powerUps;
  st.portals += run.portalsUsed;
  st.seconds += run.seconds;
  st.bestLength = Math.max(st.bestLength, run.maxLength);
  st.bestCombo = Math.max(st.bestCombo, run.maxCombo);

  const newBest = run.score > save.best[run.mode];
  save.best[run.mode] = Math.max(save.best[run.mode], run.score);

  // Campaign stars (only improvements count).
  let stars = 0;
  let previousStars = 0;
  if (run.mode === 'campaign' && run.levelId) {
    const level = LEVELS[run.levelId - 1];
    stars = starsFor(level, run.score, run.won);
    previousStars = save.stars[run.levelId - 1] ?? 0;
    while (save.stars.length < run.levelId) save.stars.push(0);
    save.stars[run.levelId - 1] = Math.max(previousStars, stars);
  }

  // Daily streak: consecutive calendar days with at least one daily run.
  if (run.mode === 'daily') {
    if (save.daily.lastDate !== date) {
      save.daily.streak = save.daily.lastDate === yesterday(date) ? save.daily.streak + 1 : 1;
      save.daily.bestToday = 0;
      save.daily.lastDate = date;
    }
    save.daily.bestToday = Math.max(save.daily.bestToday, run.score);
  }

  // Missions.
  const completed: Mission[] = [];
  const before = currentMissions(save, date);
  for (const m of before) {
    if (m.claimed) continue;
    const tpl = MISSION_TEMPLATES.find((t) => m.id.startsWith(`${t.id}:`))!;
    const value = tpl.metric(run);
    const item = save.missions.items.find((i) => i.id === m.id)!;
    item.progress = Math.min(m.target, tpl.kind === 'sum' ? item.progress + value : Math.max(item.progress, value));
    if (item.progress >= m.target) {
      item.claimed = true;
      completed.push({ ...m, progress: item.progress, claimed: true });
    }
  }

  // Currency and XP. Stars and missions pay a bonus.
  let coins = Math.floor(run.score / 10) + Math.max(0, stars - previousStars) * 25;
  coins += completed.reduce((sum, m) => sum + m.reward, 0);

  const unlocked: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (!save.achievements.includes(a.id) && a.test(save, run)) {
      save.achievements.push(a.id);
      unlocked.push(a);
      coins += a.reward;
    }
  }
  save.coins += coins;

  const xp = Math.round(run.score / 4 + run.fruits * 3 + run.seconds / 2);
  save.xp += xp;
  let levelUps = 0;
  while (save.xp >= xpToNext(save.level)) {
    save.xp -= xpToNext(save.level);
    save.level++;
    levelUps++;
  }

  return { coins, xp, levelUps, newBest, stars, previousStars, achievements: unlocked, missions: completed };
}

/** Re-checks achievements that don't depend on a run (e.g. after buying a skin). */
export function checkPassiveAchievements(save: SaveData): Achievement[] {
  const dummy: RunStats = {
    mode: 'classic', score: 0, fruits: 0, goldens: 0, powerUps: 0, maxCombo: 0,
    maxLength: 0, seconds: 0, portalsUsed: 0, reason: 'wall', won: false,
  };
  const unlocked = ACHIEVEMENTS.filter((a) => !save.achievements.includes(a.id) && a.test(save, dummy));
  for (const a of unlocked) {
    save.achievements.push(a.id);
    save.coins += a.reward;
  }
  return unlocked;
}

/** Highest campaign level the player may start (next one after the last cleared). */
export function unlockedLevel(save: SaveData): number {
  let n = 1;
  while (n <= LEVELS.length && (save.stars[n - 1] ?? 0) > 0) n++;
  return Math.min(n, LEVELS.length);
}

function yesterday(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return todayKey(new Date(y, m - 1, d - 1));
}
