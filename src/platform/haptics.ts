import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'error';

let enabled = true;

export function setHaptics(on: boolean): void {
  enabled = on;
}

/**
 * Native haptics on Android/iOS through Capacitor; falls back to the
 * Vibration API on the web (ignored where unsupported, e.g. iOS Safari).
 */
export function haptic(kind: HapticKind): void {
  if (!enabled) return;
  if (Capacitor.isNativePlatform()) {
    const run =
      kind === 'success' ? Haptics.notification({ type: NotificationType.Success })
      : kind === 'error' ? Haptics.notification({ type: NotificationType.Error })
      : Haptics.impact({ style: kind === 'light' ? ImpactStyle.Light : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Heavy });
    run.catch(() => {});
    return;
  }
  const ms = { light: 8, medium: 18, heavy: 40, success: [12, 40, 12], error: [60, 30, 60] }[kind];
  navigator.vibrate?.(ms);
}
