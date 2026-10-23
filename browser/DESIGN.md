# Upward: a little momentum

A dark browser playground built around a single tactile material: tension.
The ball, strings, trail, and camera belong to the same physical event.

## Palette and type

The interface uses the supplied neutral shadcn theme without replacing its tokens.
`src/index.css` contains the complete light and dark palette, radius, spacing,
tracking, and shadow definitions. All interface surfaces, controls, borders and
supporting copy reference those semantic tokens. Inter is self-hosted and carries
both the display type and controls; scores and calibration use tabular numbers.

Dark is the default, applied on the HTML root before the first render. Tracking
is `0.025em` throughout, as requested, including display type and controls.
Caption, control, body, and title roles use a small rem-based scale; captions
start at 12px at the default browser text size. Body leading is 1.6 and display
leading is 1.1. The loaded variable font covers weights 100–900.

Pip is a red ball with two plain white circular eyes. It keeps an
occasional blink, glances around at rest, and tracks movement with spring-driven
gaze of the eye pair. There is no mouth, crest, or glossy face decoration. Squash/stretch still
comes from real collisions; the collision radius is unchanged. Character drawing
constants live in `src/game/renderer.ts`.

The journey begins with a near-black charcoal sky and neutral accents. Colored stages
alternate strongly contrasting RGB-spectrum hues: red (500m), blue (1200m),
gold (2100m), violet (3200m), green (4500m), orange (6000m), cyan (7800m),
magenta (9900m), and lime (12300m). Sky tint is subtle (OKLCH lightness .175, chroma .014), with a dim atmosphere; transitions settle
over 15m, rather than spending 150m in similar intermediate shades. The red
ball stays red. The altitude dock shows the level count and progress track.

The physics world spans the entire viewport using one uniform scale, so Pip's
shape remains round and steering can reach either screen edge. New routes sweep
across this wider world. Route widths halve each level and vertical density is multiplied by 0.7, until
the user-approved practical limits apply: 8 world-unit minimum line width and
129 maximum gap. Level two has 87–98 unit lines and 88.6–114.3 unit gaps, with
at least 100 units of lateral movement when reachable. Starting ranges are
174–196 and 62–80. Difficulty ramps settle over 12m. Later widths reach 43.5,
21.75, 10.875, then the 8-unit floor; density reaches the jump-safe ceiling by
level three. Lateral targeting continues to demand steering within flight-time
limits. Percentages intentionally stop at these limits rather than changing
jump physics or rendering invisible lines.

On a wide screen, a left-aligned welcome balances Pip’s starting position on the right.
On narrower screens, the welcome centers over a quieter preview of the first two
strings. During a run, the world centers and the welcome disappears. A compact
bottom dock holds altitude, level progress, play/pause, recenter, and restart. The
settings dialog reveals less frequently needed controls. Its header and footer
stay outside the scroll region. At narrow widths or enlarged text, primary
actions stay in view while supporting content can scroll. Layout uses logical
properties for interface alignment; the physical game coordinates stay physical.

Apple Design informs immediate press feedback, a restrained translucent toolbar,
causal ball/string response, and separate reduced-motion, reduced-transparency,
and higher-contrast treatments. Inter and the supplied palette remain the
user-selected identity.

## Motion storyboard

| Trigger | Response |
| --- | --- |
| Open | Ball launches into view from below, then lands on the first string |
| 180 ms | Welcome copy settles into place; controls already respond |
| 950 ms | Secondary explanation settles |
| First contact around 1150 ms | String bends, ball squashes, a ring travels outward |
| Land during play | The same spring system drives the ball and string |
| Forward tilt | Jump energy increases proportionally, capped once per flight |
| Strong rebound | A larger string reaction, broader ripple, more stretch and trail |
| Pause / hidden tab / sensor loss | Physics stops immediately |

The control signal never waits for visual effects. Springs continue from their
existing velocity, rather than restarting a canned animation. Input smoothing
stays short, small tilt inputs remain gentle, and returning to center brakes
promptly. Every base platform is reachable without a boosted jump.

The storyboarding and tunable motion constants follow Interface Craft. Short,
purposeful UI transitions, interruptibility, focus behavior, visible press states,
and reduced-motion support follow Emil Kowalski's design-engineering guidance.

## Visual review

| Before | After | Why |
| --- | --- | --- |
| Individual percentage translation clipped the narrow-screen welcome | Layout uses a full-width centered welcome | Consistent layout in WebKit |
| Bespoke blue interface colors | Supplied neutral semantic theme and Inter | Consistent controls, surfaces and typography |
| Generic unnamed slider thumbs | Explicit accessible slider names | Keyboard and assistive control |
| Ball and platforms moved independently | A landing drives one shared spring response | Contact feels causal and physical |
| Full native window chrome around a prototype | Full browser field and one compact dock | The game remains the focus |


## Verification

See REVIEW.md for findings, locations, coverage, and limitations. A development-only
fixture at `tests/layout.html` checks real app viewports and keeps only one canvas
active at a time. It does not ship in `dist/`.


## Companion and progression review

All interface symbols and the favicon use Lucide. Ordinary controls share an
18px size and 1.75 stroke; keyboard hints use a smaller optical size. Static icon
imports keep the set explicit. See STRESS-REVIEW.md for data-boundary coverage,
confirmed fixes, color measurements and verification limits.

## Night sky and solid controls

The interface uses the existing dark shadcn components and theme: solid cards,
neutral borders, simple selected states, consistent Lucide icons and 0.025em
tracking. Glass and buildings are removed from the active app.

`src/game/stars.ts` creates a stable scatter of 35–220 small stars on resize,
with density adapted to the viewport. Slow linear drift and independent 6–13
second brightness cycles provide quiet depth. Brightness varies by only 12%
around each star's baseline. Climbing adds subtle parallax; camera kick never
shakes the sky. Pause holds drift and twinkle. Gentler Effects and system reduced
motion show static stars. Named SKY constants control density, radii and motion.
The previous regular grid marks are removed so the sky reads as natural scatter.

## Bottom bar

Altitude now lives in the bottom dock, visible in every game phase. The dock has
only three actions: play/pause (also resume/replay), recenter, and restart. Input
mode selection is available in settings; live steering/lift meters and the
separate altitude HUD are removed. The score uses tabular numerals and grouped
counts, with wrapping for unusually large scores on narrow screens.


## Settings refresh

Settings use three semantic groups: Controls, Tilt tuning, and Experience. Selected control cards expose pressed state and a checkmark. Tilt direction is fixed: forward reversal is enabled by default, including legacy saved settings; reversal switches and the Advanced disclosure are removed. The 38rem panel uses auto-fitting grids, a constrained scrolling body, and a persistent Done footer. Neutral translucent shadcn surfaces blur the game behind the bottom dock and run panels; settings additionally use a blurred dimming scrim. Reduced transparency returns solid surfaces, and reduced motion removes press scaling.

## Controls simplification

The welcome uses a compact Play action; run panels use Play again or Resume. Primary actions share restrained padding and type, without decorative diagonal arrows or button shadows. The wordmark is slightly smaller. Restart is absent from the ready-state dock; the help footer appears only before a run. Settings omit the Drift/Lift instruction row and Gentler effects switch at the user’s request. System reduced-motion behavior remains active. Run panels use a translucent neutral surface with 24px backdrop blur, including the WebKit declaration; reduced transparency and increased contrast disable blur.

Validated with production build, lint and 26 tests, including replacement of legacy forward direction preferences. Responsive fixture checked 24 state/viewport combinations across 320px, phone, tablet, desktop, wide, short/zoom, RTL/expanded strings and 200% text without measured bounds findings. Demo fixture is paused, so its “welcome” measurements are run-state measurements; the actual ready-state visibility was separately inspected at 772×853. Game-over phone rendering and computed blur were inspected. Physical tilt direction still requires a hardware play check.
