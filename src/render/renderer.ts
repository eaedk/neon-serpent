import type { Game } from '../core/game';
import { Board, DIR_VEC, Item, ItemKind, Vec } from '../core/types';
import type { Skin } from '../meta/skins';
import { Effects } from './particles';

/** Colour of each item kind (used for items, particles and HUD chips). */
export const ITEM_COLOR: Readonly<Record<ItemKind, string>> = {
  apple: '#ff4f7b',
  golden: '#ffd35c',
  slow: '#5ad8ff',
  ghost: '#c9b6ff',
  magnet: '#ff6b5a',
  double: '#7dff8a',
  shrink: '#ffa94d',
};

const TAU = Math.PI * 2;

/**
 * Draws the game onto a full-screen canvas. Static things (background,
 * grid, walls) are cached in an offscreen layer; everything that moves is
 * drawn every frame. Coordinates are CSS pixels; the backing store is scaled
 * by devicePixelRatio (capped at 2 for performance).
 */
export class Renderer {
  readonly fx = new Effects();
  /** Board rectangle on screen (CSS px). */
  cell = 20;
  ox = 0;
  oy = 0;

  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private insetTop = 0;
  private insetBottom = 0;
  private bg: HTMLCanvasElement = document.createElement('canvas');
  private bgKey = '';
  private bgBoard: Board | null = null;
  private shake = 0;
  private flashColor = '';
  private flash = 0;
  private readonly dust = Array.from({ length: 36 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() }));

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resize();
  }

  /** Space (CSS px) reserved above and below the board for the HUD. */
  setInsets(top: number, bottom: number): void {
    if (top === this.insetTop && bottom === this.insetBottom) return;
    this.insetTop = top;
    this.insetBottom = bottom;
    this.bgKey = '';
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = this.canvas.clientWidth || window.innerWidth;
    this.h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.bgKey = '';
  }

  /** Centre of a grid cell in CSS px. */
  px(p: Vec): { x: number; y: number } {
    return { x: this.ox + (p.x + 0.5) * this.cell, y: this.oy + (p.y + 0.5) * this.cell };
  }

  addShake(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  addFlash(color: string, strength = 0.25): void {
    this.flashColor = color;
    this.flash = strength;
  }

  // ---------------------------------------------------------------- frame

  render(game: Game, skin: Skin, time: number, dt: number, hue: number): void {
    const { ctx } = this;
    this.layout(game.board);
    this.ensureBackground(game.board, hue);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.drawImage(this.bg, 0, 0, this.w, this.h);
    this.drawDust(time, hue);

    this.shake *= Math.exp(-9 * dt);
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    ctx.translate(sx, sy);

    this.drawPortals(game.board, time);
    for (const item of game.items) this.drawItem(item, time);
    this.drawSnake(game, skin, time);

    this.fx.update(dt);
    this.fx.draw(ctx);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.flash > 0.01) {
      ctx.globalAlpha = this.flash;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
      this.flash *= Math.exp(-6 * dt);
    }
  }

  private layout(board: Board): void {
    const pad = 10;
    const availW = this.w - pad * 2;
    const availH = this.h - this.insetTop - this.insetBottom - pad * 2;
    this.cell = Math.max(8, Math.floor(Math.min(availW / board.cols, availH / board.rows)));
    this.ox = Math.round((this.w - this.cell * board.cols) / 2);
    this.oy = Math.round(this.insetTop + pad + (availH - this.cell * board.rows) / 2);
  }

  // ---------------------------------------------------------------- static layer

  private ensureBackground(board: Board, hue: number): void {
    const key = `${this.w}x${this.h}@${this.dpr}|${this.cell}|${this.ox},${this.oy}|${hue}`;
    if (key === this.bgKey && board === this.bgBoard) return;
    this.bgKey = key;
    this.bgBoard = board;
    this.bg.width = this.canvas.width;
    this.bg.height = this.canvas.height;
    const g = this.bg.getContext('2d')!;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Deep space gradient.
    const grad = g.createRadialGradient(this.w / 2, this.h * 0.4, 0, this.w / 2, this.h * 0.4, Math.max(this.w, this.h) * 0.8);
    grad.addColorStop(0, `hsl(${hue} 45% 11%)`);
    grad.addColorStop(1, '#05040c');
    g.fillStyle = grad;
    g.fillRect(0, 0, this.w, this.h);

    const { cell, ox, oy } = this;
    const bw = cell * board.cols;
    const bh = cell * board.rows;

    // Board panel.
    g.save();
    roundRect(g, ox - 4, oy - 4, bw + 8, bh + 8, 14);
    g.fillStyle = 'rgba(255,255,255,0.025)';
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = `hsl(${hue} 90% 60% / ${board.wrap ? 0.25 : 0.55})`;
    g.shadowColor = `hsl(${hue} 90% 60%)`;
    g.shadowBlur = board.wrap ? 6 : 16;
    if (board.wrap) g.setLineDash([6, 8]); // dashed edge = you can pass through
    g.stroke();
    g.restore();

    // Grid dots.
    g.fillStyle = 'rgba(255,255,255,0.07)';
    for (let y = 0; y < board.rows; y++)
      for (let x = 0; x < board.cols; x++) {
        g.beginPath();
        g.arc(ox + (x + 0.5) * cell, oy + (y + 0.5) * cell, Math.max(1, cell * 0.05), 0, TAU);
        g.fill();
      }

    // Walls: glowing rounded blocks.
    g.save();
    g.shadowColor = `hsl(${hue} 90% 55%)`;
    g.shadowBlur = cell * 0.6;
    for (const k of board.walls) {
      const x = k % board.cols;
      const y = Math.floor(k / board.cols);
      const inset = cell * 0.08;
      roundRect(g, ox + x * cell + inset, oy + y * cell + inset, cell - inset * 2, cell - inset * 2, cell * 0.22);
      const wg = g.createLinearGradient(0, oy + y * cell, 0, oy + (y + 1) * cell);
      wg.addColorStop(0, `hsl(${hue} 70% 42%)`);
      wg.addColorStop(1, `hsl(${hue} 70% 24%)`);
      g.fillStyle = wg;
      g.fill();
    }
    g.restore();
    g.strokeStyle = `hsl(${hue} 100% 75% / 0.5)`;
    g.lineWidth = 1;
    for (const k of board.walls) {
      const x = k % board.cols;
      const y = Math.floor(k / board.cols);
      const inset = cell * 0.08;
      roundRect(g, ox + x * cell + inset, oy + y * cell + inset, cell - inset * 2, cell - inset * 2, cell * 0.22);
      g.stroke();
    }
  }

  private drawDust(time: number, hue: number): void {
    const { ctx } = this;
    ctx.fillStyle = `hsl(${hue} 80% 80%)`;
    for (const d of this.dust) {
      const y = ((d.y - time * 0.01 * (0.3 + d.s)) % 1 + 1) % 1;
      ctx.globalAlpha = 0.08 + 0.12 * d.s;
      ctx.beginPath();
      ctx.arc(d.x * this.w, y * this.h, 0.6 + d.s * 1.4, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- dynamic objects

  private glow(x: number, y: number, r: number, color: string, alpha: number): void {
    const { ctx } = this;
    if (!(r > 0)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'transparent');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  private drawPortals(board: Board, time: number): void {
    const { ctx, cell } = this;
    for (const portal of board.portals) {
      for (const [end, spin] of [[portal.a, 1], [portal.b, -1]] as const) {
        const { x, y } = this.px(end);
        const color = `hsl(${portal.hue} 100% 65%)`;
        this.glow(x, y, cell * 1.3, color, 0.5);
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = '#05040c';
        ctx.beginPath();
        ctx.arc(0, 0, cell * 0.38, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          ctx.lineWidth = cell * (0.09 - i * 0.02);
          ctx.rotate(time * 2.2 * spin + i);
          ctx.beginPath();
          ctx.arc(0, 0, cell * (0.44 - i * 0.12), 0, Math.PI * 1.2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  private drawItem(item: Item, time: number): void {
    const { ctx, cell } = this;
    const { x, y } = this.px(item.pos);
    const color = ITEM_COLOR[item.kind];
    // Blink when about to expire.
    if (item.ttl < 2 && Math.floor(time * 8) % 2 === 0) return;
    const spawn = Math.min(1, item.age * 4);
    // easeOutBack(0) can come out as -1e-16; gradients reject negative radii.
    const pop = Math.max(0.01, spawn < 1 ? easeOutBack(spawn) : 1 + Math.sin(time * 5 + item.pos.x) * 0.06);
    const r = cell * 0.36 * pop;

    this.glow(x, y, cell * 1.1, color, 0.45);
    ctx.save();
    ctx.translate(x, y);

    if (item.kind === 'apple') {
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      g.addColorStop(0, '#ffb3c6');
      g.addColorStop(0.4, color);
      g.addColorStop(1, '#b3143f');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, r * 0.08, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#6dff9e';
      ctx.beginPath();
      ctx.ellipse(r * 0.35, -r * 0.95, r * 0.38, r * 0.18, -0.6, 0, TAU);
      ctx.fill();
    } else if (item.kind === 'golden') {
      ctx.rotate(time * 1.5);
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 ? r * 0.5 : r * 1.15;
        const a = (i / 10) * TAU - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff6d0';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.25, 0, TAU);
      ctx.fill();
    } else {
      // Power-up badge with an icon.
      ctx.fillStyle = 'rgba(10,8,24,0.9)';
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, cell * 0.08);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + time;
        ctx.lineTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      this.drawPowerIcon(item.kind, r * 0.6, color);
    }
    ctx.restore();
  }

  /** Small vector icons so no emoji/font dependency is needed. */
  drawPowerIcon(kind: ItemKind, s: number, color: string, ctx = this.ctx): void {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1.5, s * 0.28);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    switch (kind) {
      case 'slow': // snowflake
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI;
          ctx.moveTo(Math.cos(a) * s, Math.sin(a) * s);
          ctx.lineTo(-Math.cos(a) * s, -Math.sin(a) * s);
        }
        ctx.stroke();
        break;
      case 'ghost':
        ctx.arc(0, -s * 0.15, s * 0.75, Math.PI, 0);
        ctx.lineTo(s * 0.75, s * 0.85);
        ctx.lineTo(s * 0.25, s * 0.5);
        ctx.lineTo(-s * 0.25, s * 0.85);
        ctx.lineTo(-s * 0.75, s * 0.5);
        ctx.closePath();
        ctx.stroke();
        break;
      case 'magnet':
        ctx.arc(0, 0, s * 0.7, Math.PI, 0, true);
        ctx.moveTo(-s * 0.7, 0);
        ctx.lineTo(-s * 0.7, -s * 0.8);
        ctx.moveTo(s * 0.7, 0);
        ctx.lineTo(s * 0.7, -s * 0.8);
        ctx.stroke();
        break;
      case 'double':
        ctx.font = `900 ${Math.round(s * 1.7)}px ui-rounded, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('×2', 0, s * 0.08);
        break;
      case 'shrink': // arrows pointing inward
        ctx.moveTo(-s, -s); ctx.lineTo(-s * 0.2, -s * 0.2);
        ctx.moveTo(-s * 0.2, -s * 0.75); ctx.lineTo(-s * 0.2, -s * 0.2); ctx.lineTo(-s * 0.75, -s * 0.2);
        ctx.moveTo(s, s); ctx.lineTo(s * 0.2, s * 0.2);
        ctx.moveTo(s * 0.2, s * 0.75); ctx.lineTo(s * 0.2, s * 0.2); ctx.lineTo(s * 0.75, s * 0.2);
        ctx.stroke();
        break;
      default:
        break;
    }
  }

  /** Interpolated body positions (in cell units, may be fractional). */
  private snakePoints(game: Game): Vec[] {
    const a = game.alpha; // linear: constant speed looks smoothest
    const prev = game.prevSnake;
    return game.snake.map((cur, i) => {
      const p = prev[Math.min(i, prev.length - 1)];
      // Wrap-around or portal jump: don't interpolate across the board.
      if (Math.abs(p.x - cur.x) + Math.abs(p.y - cur.y) > 1) return cur;
      return { x: p.x + (cur.x - p.x) * a, y: p.y + (cur.y - p.y) * a };
    });
  }

  private drawSnake(game: Game, skin: Skin, time: number): void {
    const { ctx, cell } = this;
    const pts = this.snakePoints(game);
    const n = pts.length;
    const screen = pts.map((p) => ({ x: this.ox + (p.x + 0.5) * cell, y: this.oy + (p.y + 0.5) * cell }));
    const connected = (i: number): boolean => Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y) <= 1.01;
    const dead = game.status === 'over' && game.reason !== 'time';

    ctx.save();
    if (game.effects.ghost > 0) ctx.globalAlpha = 0.45 + 0.15 * Math.sin(time * 12);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Soft glow underlay: one wide translucent stroke along the body.
    ctx.strokeStyle = dead ? '#ff3355' : skin.glow;
    ctx.globalAlpha *= 0.16;
    ctx.lineWidth = cell * 1.15;
    ctx.beginPath();
    ctx.moveTo(screen[0].x, screen[0].y);
    for (let i = 1; i < n; i++) {
      if (connected(i)) ctx.lineTo(screen[i].x, screen[i].y);
      else ctx.moveTo(screen[i].x, screen[i].y);
    }
    ctx.stroke();
    ctx.globalAlpha /= 0.16;

    // Body, tail first so the head is drawn on top. Tapers toward the tail.
    for (let i = n - 1; i >= 1; i--) {
      const t = i / Math.max(1, n - 1);
      ctx.strokeStyle = dead && Math.floor(time * 10) % 2 ? '#ff3355' : skin.color(t, time);
      ctx.lineWidth = cell * 0.74 * (1 - 0.4 * t);
      ctx.beginPath();
      if (connected(i)) {
        ctx.moveTo(screen[i].x, screen[i].y);
        ctx.lineTo(screen[i - 1].x, screen[i - 1].y);
      } else {
        ctx.arc(screen[i].x, screen[i].y, 0.1, 0, TAU);
      }
      ctx.stroke();
    }

    // Head.
    const head = screen[0];
    const dv = n > 1 && connected(1)
      ? normalise({ x: screen[0].x - screen[1].x, y: screen[0].y - screen[1].y })
      : DIR_VEC[game.dir];
    ctx.fillStyle = skin.color(0, time);
    ctx.beginPath();
    ctx.arc(head.x, head.y, cell * 0.44, 0, TAU);
    ctx.fill();

    // Eyes look where we're going.
    const side = { x: -dv.y, y: dv.x };
    for (const s of [-1, 1]) {
      const ex = head.x + side.x * s * cell * 0.2 + dv.x * cell * 0.12;
      const ey = head.y + side.y * s * cell * 0.2 + dv.y * cell * 0.12;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex, ey, cell * 0.12, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#0a0818';
      ctx.beginPath();
      if (dead) {
        ctx.fillRect(ex - cell * 0.08, ey - cell * 0.02, cell * 0.16, cell * 0.04);
      } else {
        ctx.arc(ex + dv.x * cell * 0.05, ey + dv.y * cell * 0.05, cell * 0.065, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();

    if (game.effects.magnet > 0) {
      ctx.save();
      ctx.strokeStyle = ITEM_COLOR.magnet;
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(time * 6);
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(head.x, head.y, cell * (1.2 + (time * 2) % 1 * 1.5), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ------------------------------------------------------------------ helpers

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function normalise(v: Vec): Vec {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
}

function easeOutBack(t: number): number {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
