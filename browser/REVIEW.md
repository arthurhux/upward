# Dark theme, typography and layout review

Reviewed the browser game's welcome, calibration, gameplay HUD, pause/retry,
control toolbar, settings, notices, shared components, renderer, input session,
motion connection, audio, and local server. This is a UI refinement using the
supplied palette, Inter, and the requested positive `0.025em` tracking.

## Typography: role, scale and wrapping

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM · resolved | src/index.css:56, src/index.css:197, src/game.css:19 | Global −0.05em tracking, display overrides as tight as −0.075em, and 9–11px captions | One 0.025em tracking token; rem-based caption/control/body/title roles; 12px caption floor | A consistent scale and readable spacing across the game and settings |
| MEDIUM · resolved | src/game.css:19, src/game.css:81, src/game.css:94 | Many independent size, weight and leading choices | Display 1.1 leading, heading 1.3, supporting copy 1.6; balanced headings and pretty paragraph wrapping | Type roles stay legible when copy wraps |
| LOW · resolved | src/index.css:184, src/game.css:63 | Font synthesis disabled wholesale; changing countdown lacked tabular figures | Loaded Inter variable weights 100–900, normal fallback synthesis, tabular countdown | Reliable loaded faces and stable changing values |

## Layout: adaptation and critical actions

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| HIGH · resolved | src/GameApp.tsx:138, src/game.css:65 | Enlarged pause content pushed the primary action below the panel's scroll edge | Message scrolls separately; action remains outside that region | Keep critical actions visible at enlarged text sizes |
| MEDIUM · resolved | src/game.css:78, src/game.css:84, src/game.css:113 | Settings sizing depended on a viewport-height subtraction that did not account for wrapping header/footer text | Constrained flex panel with a min-height-zero scroll body and stable footer | The panel adapts to longer labels and small viewports |
| MEDIUM · resolved | src/game.css:18, src/game.css:133, src/game.css:177 | Fixed-width welcome and small fixed-height controls left little growth room | Fluid welcome, short-height scroll treatment, sticky start action, rem-based minimum control heights | Preserve a start path and distinct controls as space changes |
| LOW · resolved | src/game.css:91, src/game.css:106 | Physical text alignment, fixed rows and unrestricted grid tracks | Logical alignment, minimum-zero tracks and text containers, wrapping footer | Better RTL mirroring and room for expanded strings |

## Apple Design and visual treatment

Dark is applied in HTML before the first frame, so the interface and Canvas read
the same palette immediately. Browser chrome and native form controls use a dark
color scheme. Neutral surfaces establish hierarchy; the supplied blue chart
colors identify the ball, lift and impacts. The toolbar uses translucency as a
functional layer above play. Decorative grain and redundant eyebrow labels were
removed.

Buttons retain immediate press feedback. Keyboard activation retains focus
instead of blurring it. Touch input clears on lost pointer capture. Dedicated
reduced-motion, reduced-transparency and higher-contrast styles preserve useful
feedback. Existing spring physics remain the source of ball/string reactions.

## Verification

- Build and lint passed; all 11 game behavior tests passed.
- A real app iframe checked 24 state/viewport combinations: welcome, settings
  and pause at 320×568, 390×844, 768×900, 1280×900, 1920×1080, a 640×450 zoom-equivalent
  viewport, 390×844 with RTL and expanded German settings strings, and 640×900
  with 200% root text size. No measured viewport overflow or clipped primary
  actions remained. Settings had a nonzero scroll region at every size.
- Inspected screenshots at minimum width, normal browser width and enlarged text,
  and read computed tracking. Measurements are retained in
  `../artifacts/layout-review.json`; the reusable fixture is `tests/layout.html`.
- Live MacBook connection, keyboard operation, labelled controls, tab-focus
  retention and settings scrolling were inspected. Font loading uses a bundled
  Inter face; the browser reported no warning/error logs on the final main page.
- Neutral token contrast calculations: muted text is about 7.6:1 on the main
  background and 5.8:1 on the settings surface; primary text is higher. These
  calculations do not certify every composited Canvas pixel.
- **Not verified:** true browser-menu 200% zoom (the effective CSS viewport and
  200% text were tested separately), physical touch gestures, screen-reader use,
  physical phone safe areas, non-Latin font coverage, and other browser engines.
  RTL/German is a layout stress fixture, not a shipped translation.
- Impeccable's context launcher could not initialize its cache. Its written
  guidance and the existing DESIGN.md were used directly; its binary detector
  did not run. Missing PRODUCT.md was not invented.

Approve for the inspected browser layout and typography coverage.
