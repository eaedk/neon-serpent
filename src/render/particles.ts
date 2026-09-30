/** Lightweight particle + floating-text systems (pooled arrays, additive blend). */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  size: number;
}

const MAX_PARTICLES = 500;

export class Effects {
  private particles: Particle[] = [];
  private floaters: Floater[] = [];

  /** Radial burst of `count` sparks at (x, y) in CSS pixels. */
  burst(x: number, y: number, color: string, count = 14, speed = 160, size = 3): void {
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.65);
      const life = 0.35 + Math.random() * 0.45;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: size * (0.6 + Math.random() * 0.8), color });
    }
  }

  /** Text that rises and fades, e.g. "+40". */
  float(x: number, y: number, text: string, color: string, size = 18): void {
    this.floaters.push({ x, y, text, color, life: 1, size });
  }

  clear(): void {
    this.particles.length = 0;
    this.floaters.length = 0;
  }

  update(dt: number): void {
    const drag = Math.exp(-3.2 * dt);
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= drag;
      p.vy *= drag;
      return p.life > 0;
    });
    this.floaters = this.floaters.filter((f) => {
      f.life -= dt * 0.9;
      f.y -= 42 * dt;
      return f.life > 0;
    });
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const k = p.life / p.max;
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * k), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.floaters) {
      const pop = f.life > 0.85 ? 1 + (f.life - 0.85) * 3 : 1;
      ctx.globalAlpha = Math.min(1, f.life * 1.6);
      ctx.font = `800 ${Math.round(f.size * pop)}px ui-rounded, system-ui, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(5,4,12,0.8)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }
}
