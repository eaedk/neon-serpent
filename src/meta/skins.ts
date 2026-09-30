/**
 * Snake skins. `color(t, time)` returns the body colour at position `t`
 * along the body (0 = head, 1 = tail); `time` (seconds) allows animation.
 */
export interface Skin {
  id: string;
  name: string;
  cost: number;
  color: (t: number, time: number) => string;
  /** Glow colour around the head and eaten fruit. */
  glow: string;
}

const hsl = (h: number, s: number, l: number): string => `hsl(${h} ${s}% ${l}%)`;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const SKINS: readonly Skin[] = [
  { id: 'mint', name: 'Neon Mint', cost: 0, glow: '#2bffc6', color: (t) => hsl(lerp(160, 195, t), 95, lerp(62, 48, t)) },
  { id: 'sunset', name: 'Sunset', cost: 250, glow: '#ff7a59', color: (t) => hsl(lerp(30, -30, t), 95, lerp(62, 55, t)) },
  { id: 'ocean', name: 'Deep Ocean', cost: 400, glow: '#4da3ff', color: (t) => hsl(lerp(195, 245, t), 90, lerp(62, 52, t)) },
  { id: 'candy', name: 'Candy', cost: 600, glow: '#ff7ae0', color: (t) => hsl(lerp(300, 340, t), 90, lerp(75, 66, t)) },
  { id: 'toxic', name: 'Toxic', cost: 900, glow: '#b6ff3b', color: (t, time) => hsl(lerp(95, 70, t), 100, 55 + 6 * Math.sin(time * 4 + t * 12)) },
  { id: 'ember', name: 'Ember', cost: 1300, glow: '#ff4d2e', color: (t, time) => hsl(lerp(45, 0, t) + 6 * Math.sin(time * 7 + t * 20), 100, lerp(60, 45, t)) },
  { id: 'gold', name: 'Midas', cost: 2000, glow: '#ffd35c', color: (t, time) => hsl(44, 95, 52 + 16 * Math.max(0, Math.sin(time * 3 - t * 10))) },
  { id: 'aurora', name: 'Aurora', cost: 3000, glow: '#b18cff', color: (t, time) => hsl(lerp(170, 290, (Math.sin(time * 1.5 + t * 4) + 1) / 2), 90, 65) },
  { id: 'rainbow', name: 'Prism', cost: 4500, glow: '#ffffff', color: (t, time) => hsl((t * 320 + time * 90) % 360, 95, 62) },
];

export const skinById = (id: string): Skin => SKINS.find((s) => s.id === id) ?? SKINS[0];
