import { COMBO_WINDOW, POWER_DURATION } from '../core/game';
import type { Game } from '../core/game';
import type { TimedPower } from '../core/types';
import { ITEM_COLOR } from '../render/renderer';
import { powerIcons } from './icons';
import { POWER_NAMES } from './screens';

/**
 * Updates the in-game HUD every frame, touching the DOM only when a value
 * actually changes (cheap on low-end phones).
 */
export class Hud {
  private readonly score: HTMLElement;
  private readonly comboFill: HTMLElement;
  private readonly combo: HTMLElement;
  private readonly side: HTMLElement;
  private readonly powers: HTMLElement;
  private readonly hint: HTMLElement;
  private shownScore = 0;
  private cache = new Map<string, string>();

  constructor(root: HTMLElement) {
    const $ = (id: string): HTMLElement => root.querySelector<HTMLElement>(`#${id}`)!;
    this.score = $('hud-score');
    this.comboFill = $('hud-combo-fill');
    this.combo = $('hud-combo');
    this.side = $('hud-side');
    this.powers = $('hud-powers');
    this.hint = $('hud-hint');
  }

  /** Height (px) the HUD needs above and below the board. */
  insets(): { top: number; bottom: number } {
    const top = this.score.closest('.hud-top')!.getBoundingClientRect().bottom + 6;
    const bottomEl = this.powers.closest('.hud-bottom')!.getBoundingClientRect();
    return { top, bottom: window.innerHeight - bottomEl.top + 4 };
  }

  update(game: Game, best: number, dt: number): void {
    // Score counts up smoothly.
    this.shownScore += (game.score - this.shownScore) * Math.min(1, dt * 12);
    if (Math.abs(game.score - this.shownScore) < 1) this.shownScore = game.score;
    this.set(this.score, 'score', Math.round(this.shownScore).toLocaleString('en-US'));

    const mult = game.multiplier;
    this.set(this.combo, 'combo', mult > 1 ? `x${mult}` : '');
    this.combo.classList.toggle('show', mult > 1);
    this.combo.style.setProperty('--combo', String(Math.min(8, game.combo)));
    this.comboFill.style.width = `${(game.comboTimer / COMBO_WINDOW) * 100}%`;

    let side: string;
    if (game.timeLeft !== null) {
      const t = Math.ceil(game.timeLeft);
      side = `<small>TIME</small><b class="${t <= 10 ? 'danger' : ''}">${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b>`;
    } else if (game.cfg.goal) {
      side = `<small>FRUIT</small><b>${game.fruits}/${game.cfg.goal}</b>`;
    } else {
      side = `<small>BEST</small><b>${Math.max(best, game.score).toLocaleString('en-US')}</b>`;
    }
    this.set(this.side, 'side', side, true);

    const chips = (Object.keys(game.effects) as TimedPower[])
      .filter((k) => game.effects[k] > 0)
      .map((k) => {
        const pct = Math.round((game.effects[k] / POWER_DURATION[k]) * 100);
        return `<div class="chip" style="--c:${ITEM_COLOR[k]};--p:${pct}%">${powerIcons[k]}<span>${POWER_NAMES[k]}</span></div>`;
      })
      .join('');
    this.set(this.powers, 'powers', chips, true);

    this.hint.classList.toggle('show', game.status === 'ready');
  }

  private set(el: HTMLElement, key: string, value: string, html = false): void {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    if (html) el.innerHTML = value;
    else el.textContent = value;
  }
}
