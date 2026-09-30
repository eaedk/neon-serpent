#!/usr/bin/env node
/**
 * Captures store screenshots and the Play feature graphic with headless
 * Chrome over the DevTools protocol (no npm dependencies; Node 22+ has
 * WebSocket built in). Scenes are staged through the `window.app` debug
 * handle, so they show the real game, pixel-exact at each store's size.
 *
 *   npm run dev            # in another terminal (http://localhost:5173)
 *   node scripts/store-screenshots.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..');
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173/';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;

/** Output sizes: CSS viewport × device scale factor = required pixels. */
const TARGETS = [
  { dir: 'appstore-6.9', width: 440, height: 956, scale: 3 }, // 1320×2868
  { dir: 'play-phone', width: 360, height: 640, scale: 3 }, // 1080×1920 (Play max ratio is 2:1)
];

const today = new Date();
const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

/** A save that looks like a player a few days in. */
const SAVE = {
  version: 1, coins: 1840, xp: 120, level: 7,
  best: { classic: 2360, campaign: 0, blitz: 1480, zen: 3120, daily: 980 },
  stars: [3, 3, 2, 3, 1, 3, 2, 3, 3, 2, 1, 3, 2, 3],
  skin: 'mint', skinsOwned: ['mint', 'sunset', 'ocean', 'candy'],
  achievements: ['first', 'combo5', 'len30', 'score500', 'portal'],
  stats: { games: 64, fruits: 1320, goldens: 22, powerUps: 71, portals: 30, seconds: 9400, bestLength: 47, bestCombo: 7 },
  missions: { date: '', items: [] },
  daily: { lastDate: dateKey, streak: 5, bestToday: 640 },
  settings: { sound: false, music: false, haptics: false, controls: 'swipe' },
};

/** Builds a snake from a start cell and a list of [dir, steps] moves (head first). */
const SNAKE_JS = `
  const path = (x, y, moves) => {
    const d = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
    const out = [{ x, y }];
    for (const [m, n] of moves) for (let i = 0; i < n; i++) { x += d[m][0]; y += d[m][1]; out.push({ x, y }); }
    return out;
  };
  const freeze = (g) => { g.cfg.baseSpeed = 0.05; g.cfg.maxSpeed = 0.05; g.status = 'running'; };
  const fx = (cx, cy, text, color) => {
    const p = app.renderer.px({ x: cx, y: cy });
    app.renderer.fx.burst(p.x, p.y, color, 26, 170);
    app.renderer.fx.float(p.x, p.y - app.renderer.cell * 0.9, text, color, 26);
  };
`;

const SCENES = {
  '1-gameplay': `
    app.startGame('classic'); const g = app.game; freeze(g);
    g.snake = path(9, 7, [['d', 6], ['l', 5], ['d', 4], ['r', 9], ['d', 4], ['l', 7], ['d', 3], ['r', 3]]);
    g.prevSnake = g.snake.slice(); g.dir = 'up';
    g.score = 1840; g.fruits = 31; g.combo = 5; g.comboTimer = 3.1; g.effects.magnet = 6.5;
    g.items = [
      { kind: 'apple', pos: { x: 12, y: 4 }, ttl: Infinity, age: 5 },
      { kind: 'golden', pos: { x: 4, y: 9 }, ttl: 5, age: 5 },
      { kind: 'double', pos: { x: 15, y: 11 }, ttl: 8, age: 5 },
    ];
    setTimeout(() => fx(9, 6, '+50', '#b18cff'), 150);`,
  '2-home': `app.show('home');`,
  '3-campaign': `
    app.startGame('campaign', 21); const g = app.game; freeze(g);
    g.snake = path(9, 12, [['d', 6], ['r', 3], ['d', 3]]); g.prevSnake = g.snake.slice(); g.dir = 'up';
    g.score = 960; g.fruits = 14; g.combo = 3; g.comboTimer = 2; g.effects.slow = 5;
    g.items.push({ kind: 'slow', pos: { x: 3, y: 23 }, ttl: 8, age: 5 });
    setTimeout(() => fx(9, 11, '+30', '#5ad8ff'), 150);`,
  '4-levels': `app.show('levels');`,
  '5-skins': `app.show('skins');`,
  '6-results': `
    app.startGame('blitz'); const g = app.game; freeze(g);
    g.score = 2480; g.fruits = 46; g.maxCombo = 8; g.maxLength = 38; g.goldens = 4; g.powerUpsTaken = 6;
    g.elapsed = 90; g.status = 'over'; g.reason = 'time'; app.finishRun();`,
};

// ------------------------------------------------------------------ tiny CDP client

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { send, close: () => ws.close() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'serpent-chrome-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--hide-scrollbars', '--mute-audio', '--allow-file-access-from-files', 'about:blank',
  ], { stdio: 'ignore' });

  try {
    let pageWs;
    for (let i = 0; i < 50 && !pageWs; i++) {
      await sleep(200);
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        pageWs = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
      } catch { /* Chrome still starting */ }
    }
    if (!pageWs) throw new Error('Chrome did not start');
    const cdp = await connect(pageWs);
    await cdp.send('Page.enable');

    const capture = async (file) => {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, Buffer.from(data, 'base64'));
      console.log(`  ${file.replace(ROOT + '/', '')}`);
    };

    for (const t of TARGETS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: t.width, height: t.height, deviceScaleFactor: t.scale, mobile: true });
      for (const [name, js] of Object.entries(SCENES)) {
        // Fresh page + seeded save for every scene.
        await cdp.send('Page.navigate', { url: APP_URL });
        await sleep(600);
        await cdp.send('Runtime.evaluate', { expression: `localStorage.setItem('neon-serpent/save/v1', ${JSON.stringify(JSON.stringify(SAVE))}); location.reload();` });
        await sleep(1200);
        const res = await cdp.send('Runtime.evaluate', { expression: `(() => { ${SNAKE_JS} ${js} })()`, awaitPromise: true });
        if (res.exceptionDetails) throw new Error(`${name}: ${res.exceptionDetails.exception?.description}`);
        await sleep(450);
        await capture(join(ROOT, 'store/screenshots', t.dir, `${name}.png`));
      }
    }

    // Feature graphic + plain icons for store consoles.
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 500, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: `file://${join(ROOT, 'store/feature-graphic.html')}` });
    await sleep(800);
    await capture(join(ROOT, 'store/graphics/feature-graphic.png'));
    cdp.close();
  } finally {
    chrome.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
