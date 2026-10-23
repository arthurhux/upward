# Upward — browser playground

A playful way to experiment with your Mac’s accelerometer and gyroscope. Tilt
controls run through the local sensor helper; the [online demo](https://upward-dun.vercel.app)
works with keyboard and touch. Tested on an M5 MacBook Pro; sensor availability
varies by Mac and macOS version.

A production-built React + TypeScript + Canvas game with real shadcn/ui controls.
Pip, a little ball with curious eyes, enters from below the viewport, bounces on spring-like strings, and
climbs as you balance your MacBook or use keyboard/touch controls.

## Play locally with MacBook tilt

From the parent folder, double-click **Play Upward in Browser.command**.
It builds missing artifacts, starts a loopback-only server and sensor reader,
and opens http://127.0.0.1:8787 in your browser.

1. Wait for **MacBook connected**, then select MacBook controls.
2. Click **Play**. Hold the laptop comfortably during calibration.
3. Tilt left/right to steer. Lean forward for more lift.
4. Use Settings to adjust steering and forward-lift sensitivity with the reversed forward direction enabled by default.

Forward tilt increases the actual jump height, including while rising. A jump
has a finite energy budget, so repeated rocking cannot produce unlimited flight.
Every base platform is reachable without using extra lift. The physics world
fills the entire screen. Vertical gaps, line widths and lateral hops get harder
at each new level, with fewer lines and shorter landing areas. Changes ease in
over 12m after each unlock and stop escalating after the final level. Ten color stages start with pure black, then alternate red, blue, gold, violet,
green, orange, cyan, magenta and lime. Unlock altitudes are 0, 500, 1200, 2100,
3200, 4500, 6000, 7800, 9900 and 12300 meters. Pip stays red.

| Control | Action |
| --- | --- |
| Left/right arrows or A/D | Steer |
| Hold up arrow or W | Extra lift |
| Space | Start, pause, resume |
| C | Recenter MacBook tilt |
| R | Start a new run |
| Escape | Pause, or close settings |
| Touch left/right/up buttons | Move and add lift on touch screens |

The game pauses when the tab is hidden, the window loses focus, settings open,
or a tilt run loses sensor data. Preferences and the best height save locally.
Sound is optional and starts only after a user gesture. Reduced-motion system
preferences suppress extra visual motion.

## Develop

Requires Node.js 20.19+ or 22.12+ (tested here with Node 24), plus Xcode/Swift
for building the Mac sensor helper. No native build is required for keyboard or
touch gameplay.

```sh
npm ci
npm run build:bridge
npm run bridge
```

In another terminal, `npm run dev` starts Vite; its `/api` proxy forwards motion
from the local bridge. Or use the production server directly:

```sh
npm run build
npm start
```

The server binds **127.0.0.1 only**. Stop it with Control-C. Its child sensor reader
exits with the server and restores sensor settings. It installs no service,
requests no administrator access, and sends no data to an external service.

## Production hosting

`npm run build` produces the standalone static site in **dist/**. Upload that
folder to a static host. Fonts, icons, game code, and styles are bundled locally.
The static game supports keyboard and touch without an account or server.

**MacBook tilt still needs the local helper and local launcher.** A hosted page
cannot directly read the undocumented AppleSPU sensors. The static production
bundle does not include the macOS executable. To ship MacBook tilt broadly, the
helper would be distributed separately; this repository includes a local launcher
that builds the helper on your Mac. The hosted build uses keyboard and touch; sensor connections are attempted only on loopback hosts.

## Interface review

The default interface uses the supplied dark theme, self-hosted Inter, and
`0.025em` tracking. Typography and layout decisions are in DESIGN.md; reviewed
findings and coverage are in REVIEW.md and STRESS-REVIEW.md. With the development server running,
open `/tests/layout.html` for the viewport and state review fixture.
Open `/?lab=stress&data=demo` for the dev-only Demo data / Worst case switch.
It also includes Empty, One, calibration, all color stages, 200% text and RTL.

## Check

```sh
npm test
npm run lint
npm run build
```

Physics tests cover the offscreen entrance, spring contact, proportional jump
height, midair lift with an energy cap, gentle steering, braking, base-platform
reachability, sustained climbing, bounded effects, pause, and failure states.

## Source

- **src/game/engine.ts**: deterministic physics and spring effects.
- **src/game/renderer.ts**: the ball, strings, atmospheric field, trails and ripples.
- **src/game/session.ts**: inputs, calibration, pause, persistence, lifecycle.
- **src/game/motion.ts**: live browser sensor connection.
- **src/GameApp.tsx**: interface choreography and genuine shadcn/ui controls.
- **server/server.mjs**: static hosting and loopback-only server-sent motion events.
- **../Sources/Upward/Motion.swift**: native HID reader and `--stream-motion` mode.
- **DESIGN.md**: design tokens, storyboard, and visual-review decisions.

Sensor report research: [olvvier/apple-silicon-accelerometer](https://github.com/olvvier/apple-silicon-accelerometer).
See the parent **THIRD_PARTY_NOTICES.md** for attribution. Shadcn component sources
are installed through its official registry and remain editable in src/components/ui.

Widths halve and density falls by 30% per level, stopping at an 8-unit width
floor and a 129-unit maximum gap to keep the existing jumps reachable.

### Vercel

Import the GitHub repository with **Root Directory: browser**, **Framework: Vite**,
**Build Command: npm run build**, **Output Directory: dist**, and **Node.js 24.x**.
`browser/vercel.json` pins the build settings. No environment variables are needed.
The native Swift app and loopback sensor server stay local and are not run on Vercel.
