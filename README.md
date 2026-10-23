# Upward

A playful experiment for testing your Mac’s accelerometer and gyroscope: tilt your
MacBook to steer a little red ball, lean forward to jump higher, and climb through
a quiet night sky.

[Play the browser demo](https://upward-dun.vercel.app) · [Browser setup](browser/README.md)

## Why this experiment?

Moving the computer becomes the controller. Upward turns raw motion readings into
something you can feel: the accelerometer provides a gravity reference, while the
gyroscope tracks rotation. Together they estimate tilt so you can explore sensor
response, calibration, and how small movements affect the game.

MacBook tilt has been tested on an M5 MacBook Pro. It uses undocumented AppleSPU
sensor reports, so availability depends on your Mac and macOS version. This is a
hands-on experiment rather than a hardware diagnostic or a guarantee of support
for every Mac.

The online demo supports keyboard and touch. To try the accelerometer and
gyroscope, clone the project and run the local launcher; a hosted browser page
cannot access these Mac sensors directly. Sensor readings stay on your Mac.

## Try tilt controls on your Mac

Requires Node.js 24 and Xcode or the Swift command-line tools.

```sh
git clone https://github.com/arthurhux/upward.git
cd upward
./'Play Upward in Browser.command'
```

The launcher installs browser dependencies, builds the local sensor helper, and
opens the game at `http://127.0.0.1:8787`. Choose MacBook tilt in Settings, press
Play, and hold a comfortable position during calibration. Tilt sideways to steer
and lean forward for extra lift. Press **C** whenever you want to recenter.

## Browser game

The polished browser version lives in **browser/**. Double-click
**Play Upward in Browser.command** to open it with live MacBook controls.
The ball enters from below, platforms bend on impact, and forward tilt adds
jump height. Shadcn/ui provides the settings and controls.

- Left/right tilt: steer. Forward tilt: more lift, including during ascent.
- Arrow keys or A/D: steer. Hold up arrow or W: higher jump.
- Space: pause/resume. C: recenter. R: restart.
- Steering and forward-lift sensitivity and optional sound are in Settings.
  Forward tilt uses the reversed direction by default; system reduced motion is respected.

The sensor reader stays on your Mac and sends orientation only over a
loopback connection. A static production build is in **browser/dist/**;
keyboard and touch controls work when hosted without the local helper.
See [browser/README.md](browser/README.md) for build and deployment details.

## Original native prototype

A tiny native macOS climbing game. A blue ball automatically bounces between
platforms. Physically tilt your MacBook left and right to steer, climb higher,
and beat your best height. No game engine, packages, or network connection needed.

## Play

Open **dist/Upward.app**, or double-click **Play Upward.command**.

1. Wait for **Accelerometer + gyroscope connected**. Readings stay inside the app;
   no administrator access or background service is needed on this Mac.
2. Click **Calibrate & play**. You have three seconds to pick up the laptop and
   hold it comfortably. This becomes the neutral position.
3. Lower the left or right side to steer. Small tilts make gentle corrections;
   at the default sensitivity, about 28° gives full steering. The ball bounces
   automatically when it lands on a ledge.
4. Climb for more points. Falling below the view ends your run.

The steering indicator shows what the sensors are doing. **Reverse tilt** flips
the steering direction if needed. **Calibrate** re-centers without losing your
current run. To switch to the keyboard during a paused run, turn off **Tilt steering**.

Use **Sensitivity** to adjust how much the ball moves: slide left for gentler
steering, right for stronger steering. This changes the response strength without
adding smoothing delay. Your setting is saved between sessions.

| Control | Action |
| --- | --- |
| Left/right arrows or A/D | Steer (also available while tilt is active) |
| Space | Start, pause, or resume |
| C | Three-second recalibration |
| R | Restart |
| Escape | Pause |
| Command-Q | Quit |

Switching to another app pauses the game. Losing sensor readings pauses a tilt
run rather than letting the ball fall. The highest score is saved locally.

## Build and test

Requires Xcode or the Swift command-line tools. No external dependencies.

```sh
./scripts/build.sh
./scripts/test.sh
```

The test script uses a temporary build directory to avoid Finder metadata
interfering with test-bundle signing in Documents.

The build creates an ad-hoc signed app in `dist/Upward.app`. You can also open
`Package.swift` in Xcode and run the Upward executable target.

For a three-second hardware diagnostic:

```sh
dist/Upward.app/Contents/MacOS/Upward --sensor-check
```

To render the actual native start screen without a running game:

```sh
dist/Upward.app/Contents/MacOS/Upward --render-preview artifacts/start.png
dist/Upward.app/Contents/MacOS/Upward --render-preview artifacts/play.png --playing
```

## Sensor support

The hardware registry on this M5 MacBook exposes accelerometer and gyroscope
devices. A three-second live check received 300 accelerometer and 296 gyroscope
samples without administrator privileges. The game reads Apple's undocumented SPU HID reports, using the report
layout researched by [olvvier](https://github.com/olvvier/apple-silicon-accelerometer).
Support depends on the Mac and macOS version. The app uses ordinary user access
and restores the sensor settings it changed when it exits. **Retry tilt**
reconnects if readings stop. It never launches an elevated process or installs a service.

Accelerometer gravity and gyroscope rotation are combined to estimate tilt;
gravity corrects drift. Calibration, smoothing, a small dead zone, and a maximum
steering angle make small hand movements usable. If the gyro is unavailable, the
accelerometer still works.

Gameplay remains fully playable with a keyboard if sensor access is unavailable.

## Source

- `Sources/UpwardCore/Game.swift`: physics, platform generation, scoring, tilt filter.
- `Sources/Upward/Motion.swift`: HID reader and connection status.
- `Sources/Upward/GameView.swift`: native drawing and interaction.
- `Sources/Upward/App.swift`: app lifecycle and diagnostic commands.
- `Tests/UpwardCoreTests`: physics, reachability, sustained climbing, and tilt tests.
