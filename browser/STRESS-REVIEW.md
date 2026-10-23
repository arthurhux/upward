# Pip, full-screen climbing, and stress review

## What broke — fixed after approval

| # | Severity | Field | Worst-case value | What happened | Fix |
| --- | --- | --- | --- | --- | --- |
| 1 | Broken · fixed | `notice` + retry action | A disconnected-controller notice, 640×450 or 200% text | The floating notice covered the retry button | `src/GameApp.tsx:148`, `src/game.css:226`: put overlay notices in the message scroll region; keep the primary action outside it |
| 2 | Ugly · fixed | `score`, `best`, `landings` | 999999, 1000000, 1284 | Raw digits lacked locale grouping | `src/game/format.ts:2`, `src/GameApp.tsx:130`: one locale-aware integer formatter for HUD, result, best and milestone values |
| 3 | Ugly · fixed | units | score 1, landing count 1 | “1 meters” and “1 landings” | `src/game/format.ts:5`, `src/GameApp.tsx:146`: singular/plural unit helper, including accessible labels |

The original failures are retained in `../artifacts/stress-layout-before.json` and
`stress-before.png`. After approval, the frozen worst-case dataset passed all 24
layout samples with no measured viewport or primary-action clipping/occlusion;
`stress-layout-after.json` records that result. Demo data also passed its 24
samples in `stress-demo-after.json`.

## Decisions

All three confirmed findings were approved for fixing. Full locale-formatted
numbers remain visible; this change does not silently shorten a score to “1M”.
Notices move into a scrollable message region during pause/retry. No open design
decision remains from this pass.

## What held up

- 320px, phone, tablet, 1280px and 1920px views, short effective viewport,
  200% root text, and RTL/German expansion: actions stayed within measured bounds
  after the notice fix. The settings footer remains separate from scrolling text.
- Empty score/best, one landing, disconnected controls and calibration: real
  Snapshot fixtures render without missing data strings or console errors.
- Every journey stage has a label and stage number, so color is not the only
  sign of progress. No image download or avatar fallback is needed for Pip.
- Physics tests cover a sustained unassisted climb through all five stages;
  generated routes are checked across 960 seed/height/width combinations.
- Full-width projection is tested at 320, 390, 1512, 2560 and 3440px widths;
  player bounds, line bounds and live resizing stay finite.
- 20 behavior tests, lint and the production build pass. Production assets do
  not include the stress fixtures, toggle or test scores.

## Data-boundary inventory

| Field | Source | Type | Limit | Optional? |
| --- | --- | --- | --- | --- |
| `phase` | Session Snapshot / Engine | enum | ready, calibrating, playing, paused, over | No |
| `score`, `best`, `landings`, `milestone` | Engine / local best / Snapshot | number | Unbounded finite gameplay counts; tested through 1,000,000; display guards nonfinite values | No |
| `steering`, `charge` | filtered input / Snapshot | number | −1…1, 0…1 | No |
| `countdown` | calibration / Snapshot | number | 1…3 active, 0 idle | No |
| `connection` | MotionLink / Snapshot | enum | connecting, connected, unavailable | No |
| `mode` | Session / Snapshot | enum | tilt, keyboard, touch | No |
| `notice` | Session / Snapshot | string | Unbounded; absent state is empty string; realistic disconnect recovery copy tested | Empty allowed |
| sensitivity, lift | Preferences | number | 0.6…1.5, 0.5…1.6 | Defaults |
| reverse axes, sound, gentler effects | Preferences | boolean | true/false | Defaults |
| titles, instructions, labels, tooltips | GameApp literals | string | Fixed source copy; no remote/user text input | No |
| stage name/index/next | journeyAt | enum/number | Five stages; next absent after Zenith | Next only |
| Pip pose, gaze, expression | Engine + Renderer | finite numbers | Fixed collision radius; named spring/blink settings in progression.ts | No |
| lines/effects | Engine | generated arrays | World window generated/recycled; ripple cap 8, trail cap 18; sustained particles <60 tested | Empty visual fixture |
| icons | static Lucide imports | SVG components | Fixed icon set, shared 18px/1.75 stroke policy | No |

People, identifiers, uploads, external images, timestamps and list pagination from
Break UI's catalog do not apply to this game. There is no user-authored text field
or backend score schema to impose a new limit on. A 1,000-row DOM list is not part
of the interface; the analogous long-run/effect-recycling case is tested instead.

## Color verification

The existing OKLCH theme remains the base. `src/game/progression.ts` builds role
ramps with Culori, reducing chroma to sRGB gamut while holding hue and lightness.
The same semantic accent drives the companion, contact, live meters and stage
marker. Dark field/surface tones change as altitude advances. Every stage has
textual identity as well as color.

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| LOW · resolved | src/game/progression.ts:13, src/game/renderer.ts:38 | One fixed blue appearance | Five labeled OKLCH stages; short-arc hue interpolation and a short renderer response | Progress is visible while dark surfaces stay readable |
| LOW · resolved | src/game/progression.ts:22, src/game.css:45 | UI/effects borrowed chart colors directly | Shared role-based journey ramp, used by Canvas and interface | One accent means the same thing across a stage |

Measured stage results are stored in `../artifacts/progression-colors.json`:

| Stage | Begins | Secondary / field | UI muted / toolbar with white behind it | Accent / field | Face / eye glint |
| --- | ---: | ---: | ---: | ---: | ---: |
| Nightfall | 0m | 8.59:1 | 6.59:1 | 7.91:1 | 15.79:1 |
| Dusk | 100m | 8.55:1 | 6.62:1 | 7.58:1 | 15.74:1 |
| Aurora | 250m | 8.63:1 | 6.56:1 | 8.45:1 | 15.87:1 |
| Ember | 500m | 8.56:1 | 6.62:1 | 7.65:1 | 15.74:1 |
| Zenith | 900m | 8.60:1 | 6.58:1 | 8.11:1 | 15.81:1 |

These are computed WCAG 2 pairs, including a 98%-opaque toolbar composited over
white as the conservative Canvas-content case. Browser computed colors were read
for the actual toolbar/text and Aurora background. Tests cover gamut and semantic
contrast at all 360 integer hues, including transition colors. Fine decorative
strings/fading particles are not claimed to pass text contrast.

**Not verified:** physical touch gestures, native screen-reader use, a real
browser-menu 200% zoom operation (effective viewport and 200% text checked),
physical notched-device safe areas, and other browser engines. Dark mode is the
requested shipped appearance; the previous light palette is not a separately
reviewed experience in this change. An automated matrix is not every possible
combination of browser, dimensions or future input data.

## Try the fixtures

Run `npm run dev` with the local bridge still on port 8787, then open:

`http://127.0.0.1:5173/?lab=stress&data=demo`

The dev-only bottom toggle has Demo data / Worst case / Empty / One /
Calibrating / Dusk / Aurora / Ember / Zenith, plus 200% text and RTL. Dataset
selection persists in the URL. Tests enter through the same immutable Snapshot
boundary as live play; test scores and fixture preference edits are not written into saved gameplay data.
A reset control clears the synthetic dev-origin record used while testing. The
main production origin keeps its own stored record. An isolation check switches
away from the million-point fixture and verifies a clean live record.
For constrained viewports, open `/tests/layout.html` and choose a dataset.

All confirmed findings fixed and rechecked. Approve for inspected coverage.
