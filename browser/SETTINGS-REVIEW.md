# Settings and backdrop refresh

## Grouping and hierarchy

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| Major | Settings body | Instructions, connection card, sliders and switches formed one long column | Controls, Tilt tuning and Experience have semantic headings, consistent edges, 32px section separation and 16px internal spacing | Separates choosing controls from tuning and preferences |
| Minor | Control selection | Small adjacent buttons under a dominant device card | Two selectable cards with descriptions, pressed state and selection check; compact connection status below | Makes the active input immediately clear |
| Minor | Reversal switches | Advanced options always competed with primary adjustments | Native keyboard-accessible Advanced disclosure | Keeps less common tuning available without crowding the panel |

## Surfaces and responsive behavior

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| Major | Modal and bottom dock | Late CSS overrides disabled backdrop blur | 10px modal scrim blur, 24px settings surface blur and 20px dock/run panel blur with translucent neutral surfaces | Softens the moving game behind controls while preserving shadcn styling |
| Minor | Settings width | Narrow 30rem column | 38rem panel, auto-fitting control and tuning grids, single scroll region and fixed action footer | Gives desktop controls room while stacking on smaller screens |
| Minor | Motion/accessibility | Existing press behavior and descriptions | 150ms 0.96 press feedback; reduced-motion bypass; reduced-transparency solid fallback; slider description associations | Maintains feedback and readable alternatives |

## Validation

Production TypeScript/Vite build and Oxlint pass. Browser verification was blocked: the old local server had stopped, and the in-app browser remains on a policy-blocked internal error document even after the server was restarted. No alternative browser surface was used to bypass that block. Screenshot, 320px/phone/tablet/desktop/wide viewport review, 200% text, RTL, keyboard focus, and preference-media rendering remain unverified in this revision. Responsive rules and semantic controls were reviewed in source only.

**Block visual sign-off** until the browser is refreshed to the running game and those checks can be completed. Implementation is ready for review; do not treat unobserved layouts as approved.
