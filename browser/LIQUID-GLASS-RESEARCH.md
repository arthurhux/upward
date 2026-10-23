> Archived experiment: Liquid Glass was removed in favor of solid shadcn surfaces. The research below describes the previous implementation.

# Liquid Glass research and implementation

Reviewed October 21, 2026. This is a web implementation of the referenced effect, not Apple's native renderer.

## Reference implementations

| Project | Rendering approach | Decision for Upward |
| --- | --- | --- |
| [rdev/liquid-glass-react](https://github.com/rdev/liquid-glass-react) | SVG displacement maps, separate RGB refraction, backdrop blur and saturation, directional highlights and elastic pointer response. React 19. | Use version 1.1.1 for the header control group and game dock. These stay small and share one lens per group. |
| [AndrewPrifer/liquid-dom](https://github.com/AndrewPrifer/liquid-dom) | WebGPU rendering with DOM-backed scene graphs. Its current DOM rendering requires experimental HTML-in-Canvas support behind Chrome's Canvas Draw Element flag. | Reviewed; not installed. Requiring players to enable an experimental browser flag conflicts with the browser-shipping goal. |

The React library explicitly documents partial support in Safari and Firefox: displacement is not visible. Blur and the styled material remain the fallback. Do not describe this as pixel-identical to native Liquid Glass or claim the full effect works in every browser. The unstable shader mode is intentionally not exposed; standard, polar and prominent maps are available.

## Apple resource map

| Official resource | Relevant guidance and application |
| --- | --- |
| [Liquid Glass overview](https://developer.apple.com/documentation/technologyoverviews/liquid-glass) | Native material spans SwiftUI, UIKit and AppKit. These system APIs are distinct from a browser effect. |
| [HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials) | Reserve glass for important controls/navigation; preserve content hierarchy. Regular prioritizes legibility; Clear has narrower media use cases. Upward uses one control surface per group and stronger frosting for text panels. |
| [HIG: Color](https://developer.apple.com/design/human-interface-guidelines/color) | Content should inform the material. Upward keeps the OKLCH journey palette and reduces the default artificial tint. |
| [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass) | Audit custom backgrounds that hide the material. Remove the old backdrop filter from the refractive host; the library's lens owns backdrop sampling. |
| [Applying Liquid Glass to custom views](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views) | Shape, interaction, grouping, morphing and performance. Avoid many independent lenses. Native morphing containers are not reproduced by this web integration. |
| [Meet Liquid Glass — WWDC25](https://developer.apple.com/videos/play/wwdc2025/219/) | Optical lensing, adaptation, hierarchy and accessibility. The implementation adds real edge displacement instead of relying on blur alone. |
| [Get to know the new design system — WWDC25](https://developer.apple.com/videos/play/wwdc2025/356/) | Keep content prominent, group controls intentionally, and use consistent rounded geometry. |
| [Build a SwiftUI app with the new design — WWDC25](https://developer.apple.com/videos/play/wwdc2025/323/) | Native glassEffect, interactive effects, concentricity and GlassEffectContainer. Useful design reference; not APIs for React. |
| [Build a UIKit app with the new design — WWDC25](https://developer.apple.com/videos/play/wwdc2025/284/) | Shared backgrounds, vibrant labels, adaptive opacity and control-layer restraint. Keep DOM labels sharp over the lens and avoid treating every nested button as another glass sheet. |
| [Build an AppKit app with the new design — WWDC25](https://developer.apple.com/videos/play/wwdc2025/310/) | macOS hierarchy and floating control surfaces inform the dock and header grouping. |
| [Apple Design Resources](https://developer.apple.com/design/resources/) | Official UI kits and templates for Apple platforms. Reference catalog reviewed; no Apple artwork, fonts or UI-kit assets copied into the web app. |
| [WWDC26 Design guide](https://developer.apple.com/wwdc26/guides/design/) | Checked the newer resource hub for current design guidance emphasizing readability, accessibility and adaptability. |

## Upward implementation

- `RefractiveGlass.tsx` mounts the actual `liquid-glass-react` component as a decorative layer behind the existing DOM controls. It does not intercept input or move hit targets.
- `GlassStyle.tsx` adds a Refraction folder to DialKit: enabled, displacement, aberration, elasticity, and mode. Existing material, light and shape dials remain active. Settings persist under `upward.glass.v2`; the older non-refractive preset remains untouched.
- The normal dock/header blur defaults to 6px so scene detail can refract. Text panels retain at least 20px frosting and 82% surface opacity. Instruction badges use a standard fill rather than another lens.
- System Reduce Motion and the game's Gentler Effects switch disable elastic movement. Reduced Transparency, Increased Contrast, and browsers lacking backdrop-filter use solid control surfaces and hide the lens.
- Only two refractive groups are mounted. No shader-map generation, WebGPU requirement, screen capture, or per-frame scene readback is added. Existing canvas physics are unchanged.
- Browser support limitations above are upstream-documented; Safari/Firefox and physical-device performance still require direct validation before release.

## Validation

Production TypeScript/Vite build and Oxlint pass. Vite reports a JavaScript chunk size warning; the authoring UI and optics currently share the application bundle. The visual preview check is pending because browser security policy denied access to the current tab; reopening the local preview is required before claiming visual verification.
