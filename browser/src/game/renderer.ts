import { Engine } from './engine.ts'
import { formatCount } from './format.ts'
import { FEEL, WORLD, clamp, easeOut, spring } from './tuning.ts'
import { BALL, JOURNEY_FEEL, journeyAt, paletteAtHue, viewportWorld } from './progression.ts'
import { drawStars, makeStars } from './stars.ts'

const PIP = { body: '#ef4444', shade: '#b91c1c', eye: '#ffffff', trail: '239,68,68',
  glancePeriod: 6.8, glanceHold: 1.7, eyeRadius: .21 } as const
const SKY_MOTION = { cameraResponse: 4, maxStep: .05 } as const

// Only typography comes from computed styles; journey colors are generated
// from the same gamut-mapped semantic ramp used by the interface.
function readTheme() {
  return { font: getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim() }
}

export class Renderer {
  private context: CanvasRenderingContext2D
  private width = 0
  private height = 0
  private ratio = 1
  private hue = 29
  private colorAmount = 0
  private gazeX = 0
  private gazeY = 0
  private gazeVX = 0
  private gazeVY = 0
  private stars = makeStars(0, 0)
  private skyTime = 0
  private skyCamera = 0
  private palette = readTheme()

  constructor(privateCanvas: HTMLCanvasElement) {
    const context = privateCanvas.getContext('2d', { alpha: true })
    if (!context) throw new Error('Your browser does not support Canvas 2D.')
    this.context = context
  }

  resize(width: number, height: number) {
    this.palette = readTheme()
    this.width = width; this.height = height
    this.stars = makeStars(width, height)
    this.ratio = Math.min(window.devicePixelRatio || 1, 2)
    const canvas = this.context.canvas
    canvas.width = Math.round(width * this.ratio); canvas.height = Math.round(height * this.ratio)
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`
  }

  draw(game: Engine, dt: number, reduced: boolean) {
    const ctx = this.context
    const journey = journeyAt(game.score)
    const targetHue = journey.hue
    const turn = ((targetHue - this.hue + 540) % 360) - 180
    this.hue += turn * (1 - Math.exp(-dt * JOURNEY_FEEL.colorResponse))
    this.colorAmount += (journey.color - this.colorAmount) * (1 - Math.exp(-dt * JOURNEY_FEEL.colorResponse))
    const ramp = paletteAtHue(this.hue, this.colorAmount)
    const rgba = (name: keyof typeof ramp) => (alpha = 1) => `rgba(${ramp[name].rgb.join(',')},${alpha})`
    const palette = { font: this.palette.font, background: rgba('background'), ink: rgba('text'),
      muted: rgba('atmosphere'), supporting: rgba('secondary'), highlight: rgba('light'),
      accent: rgba('accent'), middle: rgba('mid'), shade: rgba('shade'), deep: rgba('deep'),
      face: rgba('face'), glint: rgba('glint') }
    const w = this.width, h = this.height
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0)
    ctx.fillStyle = palette.background(); ctx.fillRect(0, 0, w, h)
    const ready = game.phase === 'ready' || game.phase === 'calibrating'
    const { scale } = viewportWorld(w, h)
    const originX = 0
    const originY = h - 60
    const camera = ready ? 0 : game.camera + (reduced ? 0 : game.cameraKick)
    const x = (value: number) => originX + value * scale
    const y = (value: number) => originY - (value - camera) * scale

    // The faint climb corridor supplies depth, without drawing a box around play.
    const centerX = x(game.width / 2)
    const atmosphere = ctx.createRadialGradient(centerX, h * 0.48, 10, centerX, h * 0.48, h * 0.66)
    atmosphere.addColorStop(0, palette.muted(0.65))
    atmosphere.addColorStop(0.65, palette.muted(0.25))
    atmosphere.addColorStop(1, palette.muted(0))
    ctx.fillStyle = atmosphere; ctx.fillRect(0, 0, w, h)

    const skyStep = Math.min(dt, SKY_MOTION.maxStep)
    if (!reduced && (game.phase === 'ready' || game.phase === 'playing')) {
      this.skyTime += skyStep
      this.skyCamera += ((ready ? 0 : game.camera) - this.skyCamera) * (1 - Math.exp(-skyStep * SKY_MOTION.cameraResponse))
    }
    drawStars(ctx, this.stars, w, h, this.skyCamera * scale, this.skyTime, reduced)

    const firstMark = Math.floor(camera / 500) * 500
    for (let mark = firstMark; mark < camera + WORLD.height + 180; mark += 500) {
      if (mark <= 0) continue
      const py = y(mark)
      ctx.fillStyle = palette.supporting(0.65)
      ctx.font = `500 12px ${palette.font}`
      ctx.textAlign = 'left'; ctx.fillText(`${formatCount(mark / 10)} m`, 12, py + 3)
      ctx.strokeStyle = palette.supporting(0.15); ctx.setLineDash([2, 7])
      ctx.beginPath(); ctx.moveTo(x(44), py); ctx.lineTo(x(game.width - 25), py); ctx.stroke(); ctx.setLineDash([])
    }

    if (!reduced) {
      for (const ripple of game.ripples) {
        const progress = clamp(ripple.age / FEEL.rippleLifetime)
        const radius = (20 + easeOut(progress) * (90 + ripple.power * 110)) * scale
        ctx.save(); ctx.translate(x(ripple.x), y(ripple.y)); ctx.scale(1, 0.28)
        ctx.strokeStyle = palette.accent((1 - progress) * 0.38)
        ctx.lineWidth = (1 - progress * 0.6) * 1.5
        ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
      }
    }

    for (const platform of game.platforms) {
      if (ready && w < 900 && platform.id > 1) continue
      const py = y(platform.y)
      if (py < -40 || py > h + 40) continue
      const distance = Math.abs(platform.y - (ready ? WORLD.startLine + 170 : game.y))
      const proximity = 1 - clamp(distance / 500)
      const alpha = ready ? 0.18 + proximity * 0.45 : 0.28 + proximity * 0.6
      const glow = platform.glow
      const left = x(platform.x), right = x(platform.x + platform.width)
      const contact = left + platform.width * platform.contact * scale
      const displacement = reduced ? 0 : platform.displacement * scale
      ctx.save()
      if (glow > 0.02 && !reduced) {
        ctx.shadowColor = palette.accent(glow * 0.55); ctx.shadowBlur = glow * 22 * scale
      }
      const gradient = ctx.createLinearGradient(left, py, right, py)
      gradient.addColorStop(0, palette.supporting(alpha * 0.35))
      gradient.addColorStop(clamp(platform.contact, 0.01, 0.99), glow > 0.05 ? palette.accent(0.4 + glow * 0.6) : palette.ink(alpha))
      gradient.addColorStop(1, palette.supporting(alpha * 0.35))
      ctx.strokeStyle = gradient; ctx.lineWidth = (2.3 + glow * 0.8) * scale; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(left, py)
      ctx.bezierCurveTo(left + (contact - left) * 0.55, py, contact - 14 * scale, py + displacement, contact, py + displacement)
      ctx.bezierCurveTo(contact + 14 * scale, py + displacement, right - (right - contact) * 0.55, py, right, py)
      ctx.stroke()
      ctx.shadowBlur = 0
      for (const anchor of [left, right]) {
        ctx.fillStyle = palette.supporting(alpha * 0.5)
        ctx.beginPath(); ctx.arc(anchor, py, 2.3 * scale, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = palette.background(); ctx.beginPath(); ctx.arc(anchor, py, 0.9 * scale, 0, Math.PI * 2); ctx.fill()
      }
      ctx.restore()
    }

    if (!reduced) {
      for (const particle of game.particles) {
        ctx.fillStyle = palette.accent((1 - particle.age / particle.life) * 0.5)
        ctx.beginPath(); ctx.arc(x(particle.x), y(particle.y), particle.size * scale, 0, Math.PI * 2); ctx.fill()
      }
      if (!ready && game.trail.length > 2) {
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
        for (let i = 1; i < game.trail.length; i++) {
          const weight = i / game.trail.length
          ctx.strokeStyle = `rgba(${PIP.trail},${weight * .12})`
          ctx.lineWidth = (2 + weight * 13) * scale
          ctx.beginPath(); ctx.moveTo(x(game.trail[i - 1].x), y(game.trail[i - 1].y))
          ctx.lineTo(x(game.trail[i].x), y(game.trail[i].y)); ctx.stroke()
        }
        ctx.restore()
      }
    }

    const ballX = game.x
    const ballY = ready ? (reduced ? WORLD.startLine + WORLD.radius : game.introBallY) : game.y
    const px = x(ballX), py = y(ballY)
    const radius = WORLD.radius * scale
    const nearest = game.platforms.filter(p => p.y <= ballY).sort((a, b) => b.y - a.y)[0]
    if (nearest) {
      const distance = ballY - nearest.y
      const opacity = (1 - clamp(distance / 170)) * 0.16
      // An ellipse is enough to ground the ball before contact.
      ctx.fillStyle = palette.ink(opacity)
      ctx.beginPath(); ctx.ellipse(px, y(nearest.y) + 5, radius * 1.5, 2.8 * scale, 0, 0, Math.PI * 2); ctx.fill()
    }

    const halo = ctx.createRadialGradient(px, py, radius * 0.3, px, py, radius * (4 + game.charge * 2))
    halo.addColorStop(0, `rgba(${PIP.trail},${.08 + game.charge * .06})`)
    halo.addColorStop(1, `rgba(${PIP.trail},0)`)
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(px, py, radius * (4 + game.charge * 2), 0, Math.PI * 2); ctx.fill()

    ctx.save(); ctx.translate(px, py)
    const stretch = reduced ? 0 : clamp(Math.abs(game.vy) / 1500, 0, 0.15)
    const squash = reduced ? 0 : game.squash
    ctx.rotate(ready || reduced ? 0 : clamp(game.vx / 2300, -0.12, 0.12))
    ctx.scale(1 + squash - stretch * 0.45, 1 - squash * 0.7 + stretch)
    ctx.shadowColor = palette.deep(0.27); ctx.shadowBlur = 18 * scale; ctx.shadowOffsetY = 8 * scale
    const surface = ctx.createRadialGradient(-radius * 0.4, -radius * 0.55, 0, radius * 0.2, radius * 0.25, radius * 1.4)
    surface.addColorStop(0, PIP.body); surface.addColorStop(0.65, PIP.body); surface.addColorStop(1, PIP.shade)
    ctx.fillStyle = surface; ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill()
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
    // Pip: gaze tracks the input, while the face inherits the body's actual
    // squash/stretch. Blink and expression never change the collision radius.
    const glance = game.time % PIP.glancePeriod
    const lookingAround = ready || Math.abs(game.vx) < 15
    const idleX = glance < PIP.glanceHold ? -.11 : glance < PIP.glanceHold * 2 ? .1 : 0
    const idleY = glance < PIP.glanceHold * 2 ? -.04 : 0
    const gazeTargetX = reduced ? 0 : lookingAround ? idleX : clamp(game.vx / WORLD.maxSpeed, -1, 1) * BALL.gazeTravel
    const gazeTargetY = reduced ? 0 : lookingAround ? idleY : clamp(-game.vy / WORLD.maxJump, -1, 1) * BALL.gazeVerticalTravel
    const faceStep = Math.min(dt, BALL.maxStep)
    const gx = spring(this.gazeX - gazeTargetX, this.gazeVX, faceStep, BALL.gazeStiffness, BALL.gazeDamping)
    const gy = spring(this.gazeY - gazeTargetY, this.gazeVY, faceStep, BALL.gazeStiffness, BALL.gazeDamping)
    this.gazeX = gazeTargetX + gx[0]; this.gazeVX = gx[1]
    this.gazeY = gazeTargetY + gy[0]; this.gazeVY = gy[1]
    const blinkTime = game.time % BALL.blinkPeriod
    const blink = !reduced && blinkTime < BALL.blinkDuration
      ? 1 - .88 * Math.sin(Math.PI * blinkTime / BALL.blinkDuration) : 1
    // Just two white circles. The pair glances together, without pupils or a mouth.
    for (const side of [-1, 1]) {
      const ex = radius * (side * BALL.eyeGap + this.gazeX * .5)
      const ey = radius * (-.1 + this.gazeY * .5)
      ctx.fillStyle = PIP.eye
      ctx.beginPath(); ctx.ellipse(ex, ey, radius * PIP.eyeRadius, radius * PIP.eyeRadius * blink, 0, 0, Math.PI * 2); ctx.fill()
    }
    if (game.charge > 0.1 && !reduced) {
      ctx.strokeStyle = palette.accent(game.charge * 0.35); ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(0, 0, radius * (1.3 + game.charge * 0.18), game.time, game.time + Math.PI * 1.5); ctx.stroke()
    }
    ctx.restore()

    if (game.flash > 0.005 && !reduced) {
      ctx.fillStyle = palette.highlight(game.flash); ctx.fillRect(0, 0, w, h)
    }
    // Optical fade keeps moving lines out of the controls and header.
    const edge = ctx.createLinearGradient(0, 0, 0, h)
    edge.addColorStop(0, palette.background()); edge.addColorStop(0.11, palette.background(0))
    edge.addColorStop(0.83, palette.background(0)); edge.addColorStop(1, palette.background())
    ctx.fillStyle = edge; ctx.fillRect(0, 0, w, h)
  }
}
