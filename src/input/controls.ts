import type { Dir } from '../core/types';

export interface ControlHandlers {
  onDir: (d: Dir) => void;
  onTap?: () => void;
  onPause?: () => void;
}

/** Minimum finger travel (CSS px) that counts as a swipe. */
const SWIPE_THRESHOLD = 18;

const KEYS: Record<string, Dir> = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

/**
 * Swipe + keyboard input. A swipe fires as soon as the finger has moved far
 * enough (no need to lift), and the origin then resets to the current point,
 * so one continuous gesture can chain several turns (e.g. an L or a U-turn).
 */
export class Controls {
  enabled = false;
  private origin: { x: number; y: number; id: number } | null = null;
  private swiped = false;
  private downAt = 0;

  constructor(
    private readonly surface: HTMLElement,
    private readonly handlers: ControlHandlers,
  ) {
    surface.addEventListener('pointerdown', this.onDown);
    surface.addEventListener('pointermove', this.onMove);
    surface.addEventListener('pointerup', this.onUp);
    surface.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', this.onKey);
  }

  dispose(): void {
    this.surface.removeEventListener('pointerdown', this.onDown);
    this.surface.removeEventListener('pointermove', this.onMove);
    this.surface.removeEventListener('pointerup', this.onUp);
    this.surface.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('keydown', this.onKey);
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    this.origin = { x: e.clientX, y: e.clientY, id: e.pointerId };
    this.swiped = false;
    this.downAt = performance.now();
  };

  private onMove = (e: PointerEvent): void => {
    const o = this.origin;
    if (!this.enabled || !o || o.id !== e.pointerId) return;
    const dx = e.clientX - o.x;
    const dy = e.clientY - o.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
    const dir: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    this.handlers.onDir(dir);
    this.swiped = true;
    this.origin = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.origin || this.origin.id !== e.pointerId) return;
    if (this.enabled && !this.swiped && performance.now() - this.downAt < 300) this.handlers.onTap?.();
    this.origin = null;
  };

  private onKey = (e: KeyboardEvent): void => {
    if (!this.enabled) return;
    const dir = KEYS[e.code];
    if (dir) {
      e.preventDefault();
      this.handlers.onDir(dir);
    } else if (e.code === 'Space' || e.code === 'Escape' || e.code === 'KeyP') {
      e.preventDefault();
      this.handlers.onPause?.();
    }
  };
}
