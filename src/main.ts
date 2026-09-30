/**
 * Neon Serpent — application entry point.
 *
 * `App` owns the render loop and the screen state machine and glues the
 * pure game core (src/core) to rendering, UI, audio, haptics and saves.
 */
import './ui/styles.css';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { botSteer } from './core/bot';
import { Game } from './core/game';
import { LEVELS, WORLDS, createConfig } from './core/levels';
import { todayKey } from './core/rng';
import type { Dir, GameEvent, ModeId } from './core/types';
import { Controls } from './input/controls';
import { applyRun, checkPassiveAchievements, currentMissions } from './meta/progression';
import { skinById } from './meta/skins';
import { SaveData, defaultSave, loadSave, writeSave } from './meta/storage';
import { audio } from './platform/audio';
import { haptic, setHaptics } from './platform/haptics';
import { ITEM_COLOR, Renderer } from './render/renderer';
import { Hud } from './ui/hud';
import {
  MODE_INFO,
  POWER_NAMES,
  QuestTab,
  gameHud,
  gameOverOverlay,
  homeScreen,
  levelsScreen,
  pauseOverlay,
  questsScreen,
  settingsScreen,
  skinsScreen,
} from './ui/screens';

type Screen = 'home' | 'levels' | 'skins' | 'quests' | 'settings' | 'game';

/** Colour of the floating "+points" text for each combo step. */
const COMBO_COLORS = ['#ffffff', '#ffffff', '#7dffcf', '#5ad8ff', '#b18cff', '#ff7ae0', '#ff9f5a', '#ffd35c', '#ff4f7b'];
const DEMO_HUE = 265;

class App {
  private save: SaveData = loadSave();
  private readonly root = document.getElementById('ui')!;
  private readonly renderer = new Renderer(document.getElementById('stage') as HTMLCanvasElement);
  private readonly controls: Controls;

  private screen: Screen = 'home';
  private questTab: QuestTab = 'missions';
  private confirmReset = false;

  /** The player's current run (null on menus). */
  private game: Game | null = null;
  /** Attract-mode snake that plays itself behind the menus. */
  private demo = this.newDemo();
  private hud: Hud | null = null;
  private paused = false;
  private finished = false;
  private mode: ModeId = 'classic';
  private levelId = 1;
  private hue = DEMO_HUE;

  private last = performance.now();
  private time = 0;

  constructor() {
    this.controls = new Controls(this.root, {
      onDir: (d) => this.steer(d),
      onTap: () => this.game?.start(),
      onPause: () => (this.paused ? this.resume() : this.pause()),
    });
    this.bindEvents();
    this.applySettings();
    this.render();
    requestAnimationFrame(this.loop);
  }

  // ---------------------------------------------------------------- wiring

  private bindEvents(): void {
    // Browsers only allow audio after a user gesture.
    const unlock = (): void => audio.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });

    this.root.addEventListener('click', (e) => {
      const el = (e.target as Element).closest<HTMLElement>('[data-action]');
      if (el && !(el as HTMLButtonElement).disabled) this.action(el.dataset.action!, el.dataset.arg);
    });
    // D-pad reacts on press, not release, for responsiveness.
    this.root.addEventListener('pointerdown', (e) => {
      const el = (e.target as Element).closest<HTMLElement>('[data-dir]');
      if (el) {
        e.preventDefault();
        this.steer(el.dataset.dir as Dir);
      }
    });

    window.addEventListener('resize', () => {
      this.renderer.resize();
      this.updateInsets();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
        audio.suspend();
      } else {
        audio.resume();
        this.last = performance.now();
      }
    });

    if (Capacitor.isNativePlatform()) {
      void CapApp.addListener('backButton', () => this.back());
    } else if ('serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  private applySettings(): void {
    audio.setSfx(this.save.settings.sound);
    audio.setMusic(this.save.settings.music);
    setHaptics(this.save.settings.haptics);
  }

  private persist(): void {
    writeSave(this.save);
  }

  // ---------------------------------------------------------------- screens

  private show(screen: Screen): void {
    if (screen !== 'game') this.leaveGame();
    this.screen = screen;
    if (screen !== 'settings') this.confirmReset = false;
    this.render();
  }

  private render(): void {
    const missions = currentMissions(this.save, todayKey());
    switch (this.screen) {
      case 'home':
        this.root.innerHTML = homeScreen(this.save, missions);
        break;
      case 'levels':
        this.root.innerHTML = levelsScreen(this.save);
        break;
      case 'skins':
        this.root.innerHTML = skinsScreen(this.save);
        break;
      case 'quests':
        this.root.innerHTML = questsScreen(this.save, missions, this.questTab);
        break;
      case 'settings':
        this.root.innerHTML = settingsScreen(this.save, this.confirmReset);
        break;
      case 'game':
        return; // the game HUD is built by startGame()
    }
    this.renderer.setInsets(0, 0);
  }

  private action(name: string, arg?: string): void {
    audio.play('click');
    haptic('light');
    switch (name) {
      case 'play':
        return this.startGame(arg as ModeId);
      case 'level':
        return this.startGame('campaign', Number(arg));
      case 'next':
        return this.startGame('campaign', Math.min(LEVELS.length, this.levelId + 1));
      case 'retry':
        return this.startGame(this.mode, this.levelId);
      case 'home':
      case 'levels':
      case 'skins':
      case 'quests':
      case 'settings':
        // "Home" from a finished campaign level goes back to the level map.
        return this.show(name === 'home' && this.screen === 'game' && this.mode === 'campaign' ? 'levels' : name);
      case 'questTab':
        this.questTab = arg as QuestTab;
        return this.render();
      case 'skin':
        return this.selectSkin(arg!);
      case 'toggle': {
        const key = arg as 'sound' | 'music' | 'haptics';
        this.save.settings[key] = !this.save.settings[key];
        this.applySettings();
        this.persist();
        if (this.paused) this.showPause();
        else this.render();
        return;
      }
      case 'controls':
        this.save.settings.controls = arg as 'swipe' | 'dpad';
        this.persist();
        return this.render();
      case 'reset':
        if (this.confirmReset) {
          this.save = defaultSave();
          this.persist();
          this.applySettings();
          return this.show('home');
        }
        this.confirmReset = true;
        return this.render();
      case 'pause':
        return this.pause();
      case 'resume':
        return this.resume();
    }
  }

  /** Android hardware back button. */
  private back(): void {
    if (this.screen === 'game') {
      if (!this.finished && !this.paused) this.pause();
      else this.show(this.mode === 'campaign' ? 'levels' : 'home');
    } else if (this.screen !== 'home') {
      this.show('home');
    } else {
      void CapApp.exitApp();
    }
  }

  private selectSkin(id: string): void {
    const skin = skinById(id);
    if (!this.save.skinsOwned.includes(id)) {
      if (this.save.coins < skin.cost) {
        haptic('error');
        this.root.querySelector(`[data-arg="${id}"]`)?.classList.add('nope');
        return;
      }
      this.save.coins -= skin.cost;
      this.save.skinsOwned.push(id);
      checkPassiveAchievements(this.save);
      audio.play('levelUp');
      haptic('success');
    }
    this.save.skin = id;
    this.persist();
    this.render();
  }

  // ---------------------------------------------------------------- game flow

  private startGame(mode: ModeId, levelId = 1): void {
    const cfg = createConfig(mode, { levelId, dateKey: todayKey() });
    this.game = new Game(cfg);
    this.mode = mode;
    this.levelId = levelId;
    this.paused = false;
    this.finished = false;
    this.hue = mode === 'campaign' ? WORLDS[LEVELS[levelId - 1].world].hue : MODE_INFO[mode].hue;
    this.screen = 'game';
    this.renderer.fx.clear();

    this.root.innerHTML = gameHud(mode, this.save.settings.controls === 'dpad', this.save.stats.games === 0);
    this.hud = new Hud(this.root);
    this.controls.enabled = true;
    audio.setIntensity(1);
    this.updateInsets();
  }

  private leaveGame(): void {
    this.game = null;
    this.hud = null;
    this.paused = false;
    this.controls.enabled = false;
    audio.setIntensity(0);
  }

  private updateInsets(): void {
    if (!this.hud) return;
    const { top, bottom } = this.hud.insets();
    this.renderer.setInsets(top, bottom);
  }

  private steer(d: Dir): void {
    if (!this.game || this.paused || this.finished) return;
    this.game.steer(d);
  }

  private pause(): void {
    if (this.screen !== 'game' || !this.game || this.paused || this.finished) return;
    this.paused = true;
    this.controls.enabled = false;
    this.showPause();
  }

  private showPause(): void {
    this.root.querySelector('.overlay')?.remove();
    this.root.insertAdjacentHTML('beforeend', pauseOverlay(this.save));
  }

  private resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.controls.enabled = true;
    this.root.querySelector('.overlay')?.remove();
    this.last = performance.now();
  }

  /** Ends the run after `delay` ms (so the death / win animation can play). */
  private finishLater(delay: number): void {
    const game = this.game;
    this.controls.enabled = false;
    window.setTimeout(() => {
      if (this.game === game) this.finishRun();
    }, delay);
  }

  private finishRun(): void {
    if (!this.game || this.finished) return;
    this.finished = true;
    const run = { ...this.game.stats(), levelId: this.mode === 'campaign' ? this.levelId : undefined };
    const rewards = applyRun(this.save, run, todayKey());
    this.persist();
    audio.setIntensity(0);
    if (rewards.levelUps || rewards.achievements.length) window.setTimeout(() => audio.play('levelUp'), 350);
    this.root.querySelector('.overlay')?.remove();
    this.root.insertAdjacentHTML('beforeend', gameOverOverlay(run, rewards, this.save));
  }

  /** Turns simulation events into juice: particles, sound, haptics. */
  private handleEvents(events: GameEvent[]): void {
    const { renderer } = this;
    const fx = renderer.fx;
    for (const e of events) {
      switch (e.type) {
        case 'eat': {
          const p = renderer.px(e.pos);
          const golden = e.kind === 'golden';
          fx.burst(p.x, p.y, ITEM_COLOR[e.kind], golden ? 34 : 14, golden ? 240 : 150);
          fx.float(p.x, p.y - renderer.cell * 0.7, `+${e.points}`, COMBO_COLORS[Math.min(8, e.combo)], 15 + Math.min(8, e.combo) * 1.6);
          audio.play(golden ? 'golden' : 'eat', e.combo);
          haptic(golden ? 'medium' : 'light');
          if (e.combo >= 4) renderer.addShake(e.combo * 0.8);
          break;
        }
        case 'power': {
          const p = renderer.px(e.pos);
          fx.burst(p.x, p.y, ITEM_COLOR[e.kind], 30, 220);
          fx.float(p.x, p.y - renderer.cell, `${POWER_NAMES[e.kind].toUpperCase()}!`, ITEM_COLOR[e.kind], 20);
          renderer.addFlash(ITEM_COLOR[e.kind], 0.16);
          audio.play('power');
          haptic('medium');
          break;
        }
        case 'powerEnd':
          audio.play('powerEnd');
          break;
        case 'expire': {
          const p = renderer.px(e.pos);
          fx.burst(p.x, p.y, 'rgba(255,255,255,0.5)', 8, 80, 2);
          audio.play('expire');
          break;
        }
        case 'portal':
          for (const v of [e.from, e.to]) {
            const p = renderer.px(v);
            fx.burst(p.x, p.y, '#c38cff', 16, 140);
          }
          audio.play('portal');
          haptic('light');
          break;
        case 'die': {
          const p = renderer.px(e.pos);
          fx.burst(p.x, p.y, '#ff3355', 46, 300, 4);
          fx.burst(p.x, p.y, '#ffffff', 16, 180, 2);
          renderer.addShake(18);
          renderer.addFlash('#ff2244', 0.3);
          audio.play('die');
          haptic('error');
          this.finishLater(950);
          break;
        }
        case 'win':
          this.confetti();
          audio.play('win');
          haptic('success');
          this.finishLater(900);
          break;
        case 'timeUp':
          audio.play('win');
          haptic('success');
          this.finishLater(500);
          break;
      }
    }
  }

  private confetti(): void {
    const { renderer } = this;
    const colors = ['#ffd35c', '#7dffcf', '#ff7ae0', '#5ad8ff'];
    for (let i = 0; i < 6; i++) {
      const x = renderer.ox + Math.random() * renderer.cell * 18;
      const y = renderer.oy + Math.random() * renderer.cell * 20;
      renderer.fx.burst(x, y, colors[i % colors.length], 24, 260, 3.5);
    }
  }

  private newDemo(): Game {
    const cfg = createConfig('zen', { seed: Math.floor(Math.random() * 1e9) });
    const game = new Game({ ...cfg, baseSpeed: 9, maxSpeed: 12, powerUps: false });
    game.start();
    return game;
  }

  // ---------------------------------------------------------------- loop

  private loop = (now: number): void => {
    // Schedule first so one bad frame can never freeze the game.
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    const skin = skinById(this.save.skin);

    if (this.screen === 'game' && this.game) {
      if (!this.paused && !this.finished) this.handleEvents(this.game.update(dt));
      this.hud?.update(this.game, this.save.best[this.mode], dt);
      this.renderer.render(this.game, skin, this.time, this.paused ? 0 : dt, this.hue);
    } else {
      botSteer(this.demo);
      this.demo.update(dt);
      // Restart the demo when it dies or gets long enough to clutter the menu.
      if (this.demo.isOver || this.demo.snake.length > 60) this.demo = this.newDemo();
      this.renderer.render(this.demo, skin, this.time, dt, DEMO_HUE);
    }
  };
}

// Keep a reference for debugging from the console (window.app).
(window as unknown as { app: App }).app = new App();
