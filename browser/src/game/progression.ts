import { clampChroma, converter, formatCss, type Oklch } from 'culori'
import { clamp } from './tuning.ts'

/* JOURNEY STORYBOARD — strong contrasting RGB-spectrum stages.
 * Black → red → blue → gold → violet → green → orange → cyan → magenta → lime.
 * Neighboring stages deliberately skip nearby hues; color settles over 15m.
 * Difficulty arrives over 12m. Reductions compound until physical limits apply.
 */
export const JOURNEY = [
  { at: 0, name: 'Midnight', hue: 29, color: 0 },
  { at: 500, name: 'Crimson', hue: 29, color: 1 },
  { at: 1200, name: 'Cobalt', hue: 264, color: 1 },
  { at: 2100, name: 'Solar', hue: 109, color: 1 },
  { at: 3200, name: 'Violet', hue: 300, color: 1 },
  { at: 4500, name: 'Verdant', hue: 142, color: 1 },
  { at: 6000, name: 'Ember', hue: 53, color: 1 },
  { at: 7800, name: 'Tidal', hue: 195, color: 1 },
  { at: 9900, name: 'Prism', hue: 328, color: 1 },
  { at: 12300, name: 'Lime', hue: 129, color: 1 },
] as const
export const JOURNEY_FEEL = { colorDistance: 15, colorResponse: 3, difficultyBlendDistance: 12 } as const

export const ROUTE_LIMITS = { widthRatio: .5, densityRatio: .7, minWidth: 8, maxGap: 129, gapSpread: 4 } as const
// Halve widths and retain 70% of line density each level. Density is inverse
// spacing. Clamp before a jump becomes impossible or a line becomes invisible.
export const LEVEL_ROUTES = JOURNEY.map((_, index) => {
  const widthScale = ROUTE_LIMITS.widthRatio ** index
  const density = ROUTE_LIMITS.densityRatio ** index
  const minWidth = Math.max(ROUTE_LIMITS.minWidth, 174 * widthScale)
  const maxWidth = Math.max(ROUTE_LIMITS.minWidth, 196 * widthScale)
  const maxGap = Math.min(ROUTE_LIMITS.maxGap, 80 / density)
  return { minGap: Math.min(maxGap - ROUTE_LIMITS.gapSpread, 62 / density), maxGap,
    minWidth, widthRange: maxWidth - minWidth,
    wander: index === 0 ? 65 : 140 + (index - 1) * 25,
    minHop: index === 0 ? 0 : 100 + (index - 1) * 12 }
})
export const BALL = { gazeTravel: 0.13, gazeVerticalTravel: 0.08, gazeStiffness: 220, gazeDamping: 25, maxStep: 1 / 30, blinkPeriod: 4.6, blinkDuration: 0.13, eyeGap: 0.28, eyeHeight: 0.26 } as const
export const TONES = {
  background: { l: 0.175, c: 0.014 }, surface: { l: 0.205, c: 0.02 },
  atmosphere: { l: 0.23, c: 0.035 },
  text: { l: 0.95, c: 0.012 }, secondary: { l: 0.74, c: 0.018 },
  glint: { l: 0.94, c: 0.035 }, light: { l: 0.84, c: 0.085 },
  accent: { l: 0.72, c: 0.15 }, mid: { l: 0.6, c: 0.17 },
  shade: { l: 0.46, c: 0.13 }, deep: { l: 0.32, c: 0.075 },
  face: { l: 0.18, c: 0.035 },
} as const
export type Tone = keyof typeof TONES
const rgb = converter('rgb')

// Cache gamut-mapped ramps at integer hues and color percentages; blend the resulting
// sRGB endpoints. No color conversion or style lookup occurs per canvas item.
const cache = new Map<string, ReturnType<typeof makePalette>>()
function makePalette(hue: number, colorAmount: number) {
  return Object.fromEntries(Object.entries(TONES).map(([name, tone]) => {
    const l = name === 'atmosphere' ? tone.l * colorAmount : tone.l
    const color = clampChroma({ mode: 'oklch', l, c: tone.c * colorAmount, h: hue } as Oklch, 'oklch')
    const value = rgb(color)!
    return [name, { css: formatCss(color), rgb: [value.r * 255, value.g * 255, value.b * 255] as [number, number, number] }]
  })) as Record<Tone, { css: string; rgb: [number, number, number] }>
}
export function paletteAtHue(hue: number, colorAmount = 1) {
  const h = ((Math.round(hue) % 360) + 360) % 360
  const amount = Math.round(clamp(colorAmount) * 100) / 100
  const key = `${h}:${amount}`
  if (!cache.has(key)) cache.set(key, makePalette(h, amount))
  return cache.get(key)!
}
export function journeyAt(score: number) {
  const meters = Number.isFinite(score) ? Math.max(0, score) : 0
  let index = 0
  for (let i = 1; i < JOURNEY.length; i++) if (meters >= JOURNEY[i].at) index = i
  const stage = JOURNEY[index], previous = JOURNEY[Math.max(0, index - 1)], next = JOURNEY[index + 1]
  const t = clamp((meters - stage.at) / JOURNEY_FEEL.colorDistance)
  const turn = ((stage.hue - previous.hue + 540) % 360) - 180
  return { ...stage, index, hue: ((previous.hue + turn * t) % 360 + 360) % 360,
    color: previous.color + (stage.color - previous.color) * t,
    next, progress: next ? clamp((meters - stage.at) / (next.at - stage.at)) : 1 }
}
export function difficultyAt(meters: number) {
  const stage = journeyAt(meters)
  const previous = LEVEL_ROUTES[Math.max(0, stage.index - 1)], target = LEVEL_ROUTES[stage.index]
  const t = clamp(((Number.isFinite(meters) ? meters : 0) - stage.at) / JOURNEY_FEEL.difficultyBlendDistance)
  const blend = (key: keyof typeof target) => previous[key] + (target[key] - previous[key]) * t
  return { minGap: blend('minGap'), maxGap: blend('maxGap'), minWidth: blend('minWidth'),
    widthRange: blend('widthRange'), wander: blend('wander'), minHop: blend('minHop') }
}
export function viewportWorld(width: number, height: number) {
  const scale = Math.max(0.35, Math.min((height - 110) / 720, 1.4))
  return { scale, width: Math.max(160, width / scale) }
}
