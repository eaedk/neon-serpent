/**
 * Screen templates: pure functions from state to HTML. Interaction is wired
 * by event delegation on `data-action` / `data-arg` attributes (see main.ts).
 * All strings come from the game itself (no user input), so no escaping needed.
 */
import { LEVELS, LevelDef, WORLDS } from '../core/levels';
import type { ModeId, RunStats, TimedPower } from '../core/types';
import { ACHIEVEMENTS, Mission, RunRewards, unlockedLevel, xpToNext } from '../meta/progression';
import { SKINS } from '../meta/skins';
import type { SaveData } from '../meta/storage';
import { icons, powerIcons } from './icons';

export const MODE_INFO: Readonly<Record<ModeId, { name: string; hue: number; tagline: string }>> = {
  classic: { name: 'Classic', hue: 265, tagline: 'Walls bite. How long can you grow?' },
  campaign: { name: 'Campaign', hue: 165, tagline: '36 levels across 3 worlds' },
  blitz: { name: 'Blitz', hue: 330, tagline: '90 seconds. Chain combos!' },
  zen: { name: 'Zen', hue: 190, tagline: 'Edges wrap. Relax and flow.' },
  daily: { name: 'Daily', hue: 40, tagline: 'A new board every day' },
};

export const POWER_NAMES: Readonly<Record<TimedPower | 'shrink', string>> = {
  slow: 'Slow-mo',
  ghost: 'Ghost',
  magnet: 'Magnet',
  double: 'Double',
  shrink: 'Shrink',
};

const fmt = (n: number): string => Math.floor(n).toLocaleString('en-US');
const starRow = (n: number, of = 3): string =>
  Array.from({ length: of }, (_, i) => `<span class="star ${i < n ? 'on' : ''}">${icons.star}</span>`).join('');
const totalStars = (save: SaveData): number => save.stars.reduce((a, b) => a + b, 0);

function topBar(save: SaveData): string {
  const pct = Math.round((save.xp / xpToNext(save.level)) * 100);
  return `
    <header class="topbar">
      <div class="player" title="Player level">
        <div class="lvl">${save.level}</div>
        <div class="xp"><div class="xp-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="coins">${icons.coin}<span>${fmt(save.coins)}</span></div>
    </header>`;
}

function subBar(title: string, right = ''): string {
  return `
    <header class="subbar">
      <button class="icon-btn" data-action="home" aria-label="Back">${icons.back}</button>
      <h2>${title}</h2>
      <div class="subbar-right">${right}</div>
    </header>`;
}

// ------------------------------------------------------------------ home

export function homeScreen(save: SaveData, missions: Mission[]): string {
  const open = missions.filter((m) => !m.claimed).length;
  const mode = (id: ModeId, icon: string, sub: string, action = 'play'): string => `
    <button class="mode-card" data-action="${action}" data-arg="${id}" style="--h:${MODE_INFO[id].hue}">
      <span class="mode-icon">${icon}</span>
      <span class="mode-name">${MODE_INFO[id].name}</span>
      <span class="mode-sub">${sub}</span>
    </button>`;

  return `
  <div class="screen home">
    ${topBar(save)}
    <div class="logo" aria-label="Neon Serpent">
      <span class="logo-top">NEON</span>
      <span class="logo-bottom">SERPENT</span>
    </div>
    <div class="home-actions">
      <button class="btn-play" data-action="play" data-arg="classic">
        <span class="btn-play-icon">${icons.play}</span>
        <span class="btn-play-text">PLAY<small>Classic · Best ${fmt(save.best.classic)}</small></span>
      </button>
      <div class="modes">
        ${mode('campaign', icons.map, `${totalStars(save)}/${LEVELS.length * 3} ★`, 'levels')}
        ${mode('blitz', icons.bolt, `Best ${fmt(save.best.blitz)}`)}
        ${mode('zen', icons.infinity, `Best ${fmt(save.best.zen)}`)}
        ${mode('daily', icons.calendar, save.daily.streak ? `<span class="flame">${icons.flame}</span>${save.daily.streak} day streak` : 'New board today')}
      </div>
    </div>
    <nav class="bottom-nav">
      <button data-action="skins">${icons.palette}<span>Skins</span></button>
      <button data-action="quests">${icons.trophy}<span>Quests</span>${open ? `<i class="badge">${open}</i>` : ''}</button>
      <button data-action="settings">${icons.gear}<span>Settings</span></button>
    </nav>
  </div>`;
}

// ------------------------------------------------------------------ campaign

export function levelsScreen(save: SaveData): string {
  const unlocked = unlockedLevel(save);
  const tile = (l: LevelDef): string => {
    const stars = save.stars[l.id - 1] ?? 0;
    const locked = l.id > unlocked;
    return `
      <button class="level-tile ${locked ? 'locked' : ''} ${stars ? 'done' : ''}" ${locked ? 'disabled' : ''}
              data-action="level" data-arg="${l.id}">
        <span class="level-num">${locked ? icons.lock : l.id}</span>
        <span class="level-stars">${starRow(stars)}</span>
        <span class="level-name">${l.name}</span>
      </button>`;
  };
  const worlds = WORLDS.map((w, i) => {
    const levels = LEVELS.filter((l) => l.world === i);
    const extra = i === 0 ? '' : i === 1 ? ' · portals' : ' · portals & debris';
    return `
      <section class="world" style="--h:${w.hue}">
        <h3><span>World ${i + 1}</span> ${w.name}<small>${extra}</small></h3>
        <div class="level-grid">${levels.map(tile).join('')}</div>
      </section>`;
  }).join('');
  return `
  <div class="screen panel-screen" style="--h:${MODE_INFO.campaign.hue}">
    ${subBar('Campaign', `<div class="pill">${icons.star}${totalStars(save)}/${LEVELS.length * 3}</div>`)}
    <div class="scroll">${worlds}</div>
  </div>`;
}

// ------------------------------------------------------------------ skins

export function skinsScreen(save: SaveData): string {
  const cards = SKINS.map((s) => {
    const owned = save.skinsOwned.includes(s.id);
    const equipped = save.skin === s.id;
    const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => s.color(t, 0.6)).join(', ');
    const status = equipped ? 'Equipped' : owned ? 'Tap to equip' : `${icons.coin}${fmt(s.cost)}`;
    const cls = equipped ? 'equipped' : owned ? 'owned' : save.coins >= s.cost ? 'buyable' : 'locked';
    return `
      <button class="skin-card ${cls}" data-action="skin" data-arg="${s.id}" style="--glow:${s.glow}">
        <span class="skin-preview" style="background:linear-gradient(90deg, ${stops})"><i class="skin-eye"></i></span>
        <span class="skin-name">${s.name}</span>
        <span class="skin-cost">${status}</span>
      </button>`;
  }).join('');
  return `
  <div class="screen panel-screen" style="--h:300">
    ${subBar('Skins', `<div class="pill">${icons.coin}${fmt(save.coins)}</div>`)}
    <p class="hint">Earn coins by playing, finishing quests and unlocking achievements.</p>
    <div class="scroll"><div class="skin-grid">${cards}</div></div>
  </div>`;
}

// ------------------------------------------------------------------ quests

export type QuestTab = 'missions' | 'achievements' | 'stats';

export function questsScreen(save: SaveData, missions: Mission[], tab: QuestTab): string {
  const tabs = (['missions', 'achievements', 'stats'] as const)
    .map((t) => `<button class="tab ${t === tab ? 'active' : ''}" data-action="questTab" data-arg="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`)
    .join('');

  let body = '';
  if (tab === 'missions') {
    body = `<p class="hint">New missions every day at midnight.</p>` + missions.map((m) => `
      <div class="quest ${m.claimed ? 'done' : ''}">
        <div class="quest-main">
          <div class="quest-text">${m.claimed ? icons.check : ''}${m.text}</div>
          <div class="progress"><div style="width:${Math.round((m.progress / m.target) * 100)}%"></div></div>
        </div>
        <div class="quest-reward">${icons.coin}${m.reward}</div>
      </div>`).join('');
  } else if (tab === 'achievements') {
    const done = save.achievements.length;
    body = `<p class="hint">${done} / ${ACHIEVEMENTS.length} unlocked</p>` + ACHIEVEMENTS.map((a) => {
      const got = save.achievements.includes(a.id);
      return `
      <div class="quest ${got ? 'done' : 'todo'}">
        <div class="quest-main"><div class="quest-text">${got ? icons.check : icons.lock}${a.title}</div><small>${a.desc}</small></div>
        <div class="quest-reward">${icons.coin}${a.reward}</div>
      </div>`;
    }).join('');
  } else {
    const s = save.stats;
    const h = Math.floor(s.seconds / 3600);
    const m = Math.floor((s.seconds % 3600) / 60);
    const rows: [string, string][] = [
      ['Games played', fmt(s.games)],
      ['Time played', `${h}h ${m}m`],
      ['Fruits eaten', fmt(s.fruits)],
      ['Golden fruits', fmt(s.goldens)],
      ['Power-ups', fmt(s.powerUps)],
      ['Portal trips', fmt(s.portals)],
      ['Longest snake', fmt(s.bestLength)],
      ['Best combo', `x${s.bestCombo}`],
      ['Best Classic', fmt(save.best.classic)],
      ['Best Blitz', fmt(save.best.blitz)],
      ['Best Zen', fmt(save.best.zen)],
      ['Best Daily', fmt(save.best.daily)],
    ];
    body = `<div class="stat-grid">${rows.map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('')}</div>`;
  }

  return `
  <div class="screen panel-screen" style="--h:45">
    ${subBar('Quests')}
    <div class="tabs">${tabs}</div>
    <div class="scroll">${body}</div>
  </div>`;
}

// ------------------------------------------------------------------ settings

export function settingsScreen(save: SaveData, confirmReset: boolean): string {
  const toggle = (key: 'sound' | 'music' | 'haptics', label: string): string => `
    <button class="row" data-action="toggle" data-arg="${key}">
      <span>${label}</span><span class="switch ${save.settings[key] ? 'on' : ''}"><i></i></span>
    </button>`;
  const ctl = save.settings.controls;
  return `
  <div class="screen panel-screen" style="--h:220">
    ${subBar('Settings')}
    <div class="scroll">
      <div class="group">
        ${toggle('sound', 'Sound effects')}
        ${toggle('music', 'Music')}
        ${toggle('haptics', 'Vibration')}
      </div>
      <div class="group">
        <div class="row static"><span>Controls</span>
          <div class="segmented">
            <button class="${ctl === 'swipe' ? 'active' : ''}" data-action="controls" data-arg="swipe">Swipe</button>
            <button class="${ctl === 'dpad' ? 'active' : ''}" data-action="controls" data-arg="dpad">D-pad</button>
          </div>
        </div>
      </div>
      <div class="group help">
        <h4>How to play</h4>
        <p>Swipe to steer (you can chain turns without lifting your finger). Eat fruit quickly to build a <b>combo</b> up to x8. Golden stars are worth 5× and vanish fast.</p>
        <ul class="power-help">
          <li>${powerIcons.slow}<b>Slow-mo</b> time slows down</li>
          <li>${powerIcons.ghost}<b>Ghost</b> pass through yourself and the edges</li>
          <li>${powerIcons.magnet}<b>Magnet</b> pulls nearby fruit to you</li>
          <li>${powerIcons.double}<b>Double</b> doubles all points</li>
          <li>${powerIcons.shrink}<b>Shrink</b> cuts your tail by a third</li>
        </ul>
      </div>
      <div class="group">
        <button class="row danger" data-action="reset"><span>${confirmReset ? 'Tap again to erase all progress' : 'Reset progress'}</span></button>
      </div>
      <p class="hint center">Neon Serpent v${__APP_VERSION__}</p>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ in-game

export function gameHud(mode: ModeId, dpad: boolean, firstGame: boolean): string {
  const hint = firstGame
    ? `<b>Swipe to start</b><span>Eat fruit fast to build combos · grab power-ups</span>`
    : `<b>Swipe to start</b>`;
  return `
  <div class="hud ${dpad ? 'with-dpad' : ''}" style="--h:${MODE_INFO[mode].hue}">
    <div class="hud-top">
      <button class="icon-btn" data-action="pause" aria-label="Pause">${icons.pause}</button>
      <div class="score-box">
        <div class="score" id="hud-score">0</div>
        <div class="combo-bar"><div id="hud-combo-fill"></div></div>
      </div>
      <div class="hud-side" id="hud-side"></div>
    </div>
    <div class="combo-badge" id="hud-combo"></div>
    <div class="hud-bottom">
      <div class="powers" id="hud-powers"></div>
      ${dpad ? `
      <div class="dpad">
        <button data-dir="up" aria-label="Up">${icons.next}</button>
        <button data-dir="left" aria-label="Left">${icons.next}</button>
        <button data-dir="right" aria-label="Right">${icons.next}</button>
        <button data-dir="down" aria-label="Down">${icons.next}</button>
      </div>` : ''}
    </div>
    <div class="ready-hint" id="hud-hint">${hint}</div>
  </div>`;
}

export function pauseOverlay(save: SaveData): string {
  return `
  <div class="overlay">
    <div class="card">
      <h2>Paused</h2>
      <div class="stack">
        <button class="btn primary" data-action="resume">${icons.play}Resume</button>
        <button class="btn" data-action="retry">${icons.retry}Restart</button>
        <button class="btn" data-action="home">${icons.home}Home</button>
      </div>
      <div class="quick-toggles">
        <button class="${save.settings.sound ? 'on' : ''}" data-action="toggle" data-arg="sound">Sound</button>
        <button class="${save.settings.music ? 'on' : ''}" data-action="toggle" data-arg="music">Music</button>
        <button class="${save.settings.haptics ? 'on' : ''}" data-action="toggle" data-arg="haptics">Vibration</button>
      </div>
    </div>
  </div>`;
}

export function gameOverOverlay(run: RunStats, rewards: RunRewards, save: SaveData): string {
  const level = run.levelId ? LEVELS[run.levelId - 1] : undefined;
  const title = run.won ? 'Level Clear!' : run.reason === 'time' ? "Time's Up!" : 'Game Over';
  const best = save.best[run.mode];
  const nextLevel = level && run.won && level.id < LEVELS.length;
  const primary = nextLevel
    ? `<button class="btn primary" data-action="next">Next level${icons.next}</button>`
    : `<button class="btn primary" data-action="retry">${icons.retry}Play again</button>`;

  const unlocks = [
    ...rewards.achievements.map((a) => `<li>${icons.trophy}<span>${a.title}</span><em>+${a.reward}</em></li>`),
    ...rewards.missions.map((m) => `<li>${icons.check}<span>${m.text}</span><em>+${m.reward}</em></li>`),
  ].join('');

  return `
  <div class="overlay">
    <div class="card over-card ${run.won ? 'won' : ''}">
      <h2>${title}</h2>
      ${level ? `<div class="level-label">Level ${level.id} · ${level.name}</div><div class="big-stars">${starRow(rewards.stars)}</div>` : ''}
      <div class="over-score">${fmt(run.score)}</div>
      ${rewards.newBest && run.score > 0 ? '<div class="new-best">NEW BEST!</div>' : `<div class="muted">Best ${fmt(best)}</div>`}
      <div class="over-stats">
        <div><b>${run.fruits}</b><span>fruits</span></div>
        <div><b>${run.maxLength}</b><span>length</span></div>
        <div><b>x${run.maxCombo}</b><span>combo</span></div>
        <div><b>${Math.floor(run.seconds)}s</b><span>time</span></div>
      </div>
      <div class="rewards">
        <span class="reward">${icons.coin}+${fmt(rewards.coins)}</span>
        <span class="reward xp">+${fmt(rewards.xp)} XP</span>
        ${rewards.levelUps ? `<span class="reward levelup">LEVEL ${save.level}!</span>` : ''}
      </div>
      ${unlocks ? `<ul class="unlocks">${unlocks}</ul>` : ''}
      <div class="over-actions">
        <button class="btn" data-action="home" aria-label="Home">${icons.home}</button>
        ${level && run.won ? `<button class="btn" data-action="retry" aria-label="Retry">${icons.retry}</button>` : ''}
        ${primary}
      </div>
    </div>
  </div>`;
}
