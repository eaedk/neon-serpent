# Neon Serpent 🐍

A modern, neon-styled snake game for **Android**, **iOS** and the **web (installable PWA)**, built
from one TypeScript codebase. It's light (≈25 KB gzipped, no game engine and no image or audio
assets) and built for long sessions.

## What makes it captivating

| Hook | Details |
| --- | --- |
| **5 modes** | **Classic** (walls kill), **Campaign** (36 levels, 3 worlds, 3★ ratings), **Blitz** (90 s score attack), **Zen** (wrap-around edges, relaxed), **Daily Challenge** (same board for everyone each day, with streaks) |
| **Combos** | Eat within 4 s of the last fruit to raise a multiplier up to **x8**. The pitch of the eat sound rises with the combo |
| **Power-ups** | Slow-mo, Ghost (pass through yourself and the edges), Magnet (pulls fruit to you), Double points, Shrink |
| **Golden fruit** | Worth 5× and grows you by 3, but vanishes in 6 s |
| **Portals & debris** | Worlds 2–3 add teleport portals and extra obstacles |
| **Progression** | XP and player level, coins, 9 unlockable skins (some animated), 22 achievements, 3 new daily missions |
| **Juice** | Smooth interpolated movement, glow, particles, screen shake, floating score text, haptics, generative synthwave soundtrack |

Controls: **swipe** anywhere (you can chain turns without lifting your finger), an optional
on-screen **D-pad** (Settings), or **arrow keys / WASD** and **Space** to pause on desktop.

---

## Install & run

### Android

**Option A — install the APK**

1. Get `neon-serpent.apk`, either from a GitHub Actions run (see [CI builds](#ci-builds-no-local-sdk-needed))
   or by building it yourself (Option B).
2. Copy it to your phone and tap it. Allow **"Install unknown apps"** for your file manager or
   browser when Android asks.
   Or, with USB debugging enabled:
   ```bash
   adb install -r neon-serpent.apk
   ```

**Option B — build it yourself** (needs JDK 21 and the Android SDK; the easiest way is to install
[Android Studio](https://developer.android.com/studio)):

```bash
npm install
npm run android:apk        # → android/app/build/outputs/apk/debug/app-debug.apk
```

**Run in the Android emulator:** in Android Studio open *Device Manager*, create a Pixel device,
start it, then run:

```bash
npm run android:run
```

> **This Mac already has a command-line toolchain** (no Android Studio): JDK 21 in
> `~/Library/Java/jdk-21*`, the SDK in `~/Library/Android/sdk`, and an emulator named `NeonPixel`.
> Use it like this:
>
> ```bash
> export JAVA_HOME=$(ls -d ~/Library/Java/jdk-21*/Contents/Home | head -1) ANDROID_HOME=~/Library/Android/sdk
> ~/Library/Android/sdk/emulator/emulator -avd NeonPixel -gpu host &   # -gpu host avoids WebView glitches
> npm run android:apk && ~/Library/Android/sdk/platform-tools/adb install -r android/app/build/outputs/apk/debug/app-debug.apk
> ```
>
> A ready-made APK is in `release/neon-serpent.apk`.

### iOS

Apple only lets you install apps on an iPhone if they are signed, so pick one of these:

| Route | Needs | Steps |
| --- | --- | --- |
| **PWA (quickest, free)** | Safari | Open the hosted game (GitHub Pages URL from CI, or `npm run build && npm run preview`, then open `http://<your-mac-ip>:4173` on the same Wi-Fi) → **Share** → **Add to Home Screen**. It runs full screen and works offline. |
| **Xcode, free Apple ID** | A Mac with Xcode 16+ | `npm run ios:open` → select the *App* target → *Signing & Capabilities* → pick your Team (a personal Apple ID works) → plug in your iPhone → ▶ Run. Apps signed with a free account expire after 7 days. |
| **iOS Simulator** | Xcode | In Xcode choose an iPhone simulator and press ▶. Or take `NeonSerpent-simulator.zip` from CI, unzip it and run `xcrun simctl install booted App.app`. |
| **Sideload the IPA** | Sideloadly / AltStore | Take `NeonSerpent-unsigned.ipa` from CI and sideload it; the tool re-signs it with your Apple ID. |
| **TestFlight / App Store** | Apple Developer Program ($99/yr) | Archive in Xcode (*Product → Archive*) and upload. |

### Web

```bash
npm install
npm run dev          # http://localhost:5173 (use your phone on the same Wi-Fi via the printed network URL)
```

---

## CI builds (no local SDK needed)

`.github/workflows/build.yml` runs on every push to `main` (or manually from the *Actions* tab):

- **web**: runs the unit tests, builds, and deploys to **GitHub Pages**. Enable it once under
  *Settings → Pages → Source: GitHub Actions*.
- **android**: produces `neon-serpent.apk` (artifact `neon-serpent-android`).
- **ios**: produces `NeonSerpent-simulator.zip` and `NeonSerpent-unsigned.ipa` (artifact `neon-serpent-ios`).

---

## Project layout

```
src/
  core/          Pure game logic — no DOM, fully unit-tested
    types.ts       Shared types (Vec, Board, GameConfig, GameEvent…)
    game.ts        The rules: fixed-timestep simulation, combos, power-ups, portals
    board.ts       Board builder, spawn lane, connectivity (carves sealed pockets)
    levels.ts      Obstacle patterns, 36 campaign levels, per-mode configs
    bot.ts         BFS autopilot for the animated menu background
    rng.ts         Seeded PRNG (daily challenge is identical for everyone)
  meta/          Progression
    storage.ts     Versioned save file with forward-compatible defaults
    progression.ts XP, coins, stars, streaks, daily missions, achievements
    skins.ts       Snake skins (colour functions, some animated)
  render/        Canvas 2D renderer (cached static layer + particles)
  platform/      Web Audio synth + music, Capacitor haptics
  input/         Swipe (with turn chaining) + keyboard
  ui/            Screen templates, HUD, icons, styles
  main.ts        App: screen state machine, render loop, event → juice
tests/           Vitest unit tests for core + meta
scripts/         generate-icons.mjs — renders every icon & splash from code
android/ ios/    Native Capacitor projects
```

The architecture keeps **simulation, presentation and persistence separate**. `Game.update(dt)`
advances whole moves and returns `GameEvent`s. `main.ts` turns those events into sound,
particles and haptics, and `Renderer` interpolates between `prevSnake` and `snake` to draw
smooth movement at any frame rate.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm test` | Unit tests (Vitest) |
| `npm run build` | Typecheck + production bundle in `dist/` |
| `npm run sync` | Build and copy the web bundle into the native projects |
| `npm run android:apk` | Build the debug APK |
| `npm run android:run` | Build and launch on an emulator or connected device |
| `npm run ios:open` | Build and open the iOS project in Xcode |
| `node scripts/generate-icons.mjs` | Regenerate all icons and splash screens |
