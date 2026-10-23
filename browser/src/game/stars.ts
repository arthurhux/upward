/* MOTION STORYBOARD — quiet night sky
 *    0 ms  a stable scatter of small stars fills the sky
 *   idle   linear, barely perceptible drift; slow, independent twinkles
 *  climb   distant stars move at a fraction of the camera's speed
 *  pause   drift and twinkle hold their current values
 * reduced  a completely still sky, with the same stars and brightness range
 */
export const SKY = { areaPerStar: 9500, minStars: 35, maxStars: 220,
  minRadius: .45, radiusRange: .75, minOpacity: .18, opacityRange: .32,
  twinkleAmount: .12, minPeriod: 6, periodRange: 7, drift: .65 } as const

export type Star = { x: number; y: number; radius: number; opacity: number; depth: number; phase: number; period: number }
const seed = (index: number, salt: number) => {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453
  return value - Math.floor(value)
}

// Generate only on resize; frame rendering reuses this array.
export function makeStars(width: number, height: number): Star[] {
  const count = Math.min(SKY.maxStars, Math.max(SKY.minStars, Math.round(width * height / SKY.areaPerStar)))
  return Array.from({ length: count }, (_, i) => ({
    x: seed(i, 1), y: seed(i, 2), radius: SKY.minRadius + seed(i, 3) * SKY.radiusRange,
    opacity: SKY.minOpacity + seed(i, 4) * SKY.opacityRange, depth: .035 + seed(i, 5) * .065,
    phase: seed(i, 6) * Math.PI * 2, period: SKY.minPeriod + seed(i, 7) * SKY.periodRange,
  }))
}

export function drawStars(ctx: CanvasRenderingContext2D, stars: readonly Star[], width: number, height: number,
  camera: number, time: number, reduced: boolean) {
  ctx.save()
  ctx.fillStyle = '#e2e8f0'
  for (const star of stars) {
    const travel = reduced ? 0 : camera * star.depth + time * SKY.drift * (1 + star.depth * 8)
    const span = height + 8
    const y = ((star.y * span + travel) % span + span) % span - 4
    const twinkle = reduced ? 1 : 1 + Math.sin(time * Math.PI * 2 / star.period + star.phase) * SKY.twinkleAmount
    ctx.globalAlpha = star.opacity * twinkle
    ctx.beginPath(); ctx.arc(star.x * width, y, star.radius, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}
