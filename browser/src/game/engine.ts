import { WORLD, FEEL, clamp, spring } from './tuning.ts'
import { difficultyAt } from './progression.ts'

export type Phase = 'ready' | 'calibrating' | 'playing' | 'paused' | 'over'
export interface Input { steering: number; charge: number }
export interface Platform {
  id: number; x: number; y: number; width: number
  displacement: number; velocity: number; contact: number; glow: number
}
export interface Ripple { x: number; y: number; age: number; power: number }
export interface Particle { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number }
export interface Landing { x: number; y: number; power: number; count: number }

export class Engine {
  width: number = WORLD.width
  homeFraction = 0.5
  phase: Phase = 'ready'
  x = WORLD.width / 2 as number
  y = WORLD.startLine + WORLD.radius as number
  vx = 0; vy = 0; camera = 0; peak = this.y; landings = 0; time = 0
  squash = 0; squashVelocity = 0; flash = 0; cameraKick = 0
  intro = 0; introLanded = false; introBallY = -65
  charge = 0; appliedCharge = 0
  platforms: Platform[] = []
  ripples: Ripple[] = []
  particles: Particle[] = []
  trail: { x: number; y: number }[] = []
  onLanding?: (landing: Landing) => void
  private seed: number
  private randomState: number
  private nextId = 0
  private trailTimer = 0

  constructor(seed = Math.floor(Math.random() * 0xffffffff)) {
    this.seed = seed || 1; this.randomState = this.seed
    this.reset()
  }

  get score() { return Math.max(0, Math.floor((this.peak - WORLD.startLine - WORLD.radius) / 10)) }

  reset() {
    this.phase = 'ready'; this.x = this.width * this.homeFraction; this.y = WORLD.startLine + WORLD.radius
    this.vx = 0; this.vy = 0; this.camera = 0; this.peak = this.y; this.landings = 0
    this.squash = 0; this.squashVelocity = 0; this.flash = 0; this.cameraKick = 0
    this.charge = 0; this.appliedCharge = 0; this.intro = 0; this.introLanded = false; this.introBallY = -65
    this.platforms = []; this.ripples = []; this.particles = []; this.trail = []
    this.randomState = this.seed; this.nextId = 0; this.trailTimer = 0
    this.platforms.push(this.makePlatform(this.x - 90, WORLD.startLine, 180))
    this.generate()
  }

  resizeWorld(width: number, homeFraction = 0.5) {
    if (!Number.isFinite(width) || width < 160) return
    const previous = this.width
    this.width = width; this.homeFraction = clamp(homeFraction, 0.2, 0.8)
    if (this.phase === 'ready') { this.reset(); return }
    // Translate an existing run as a unit when expanding. Shrinking clamps
    // individual strings; it never stretches an existing jump into a wider gap.
    const shift = (width - previous) / 2
    this.x = clamp(this.x + shift, WORLD.radius, width - WORLD.radius)
    for (const platform of this.platforms) {
      platform.width = Math.min(platform.width, width - 16)
      platform.x = clamp(platform.x + shift, 8, width - platform.width - 8)
    }
    for (const point of [...this.trail, ...this.particles, ...this.ripples]) point.x += shift
  }

  start(charge = 0) {
    if (this.phase === 'over') this.reset()
    if (this.phase === 'ready' || this.phase === 'calibrating') {
      this.phase = 'playing'; this.intro = FEEL.introDuration
      this.y = WORLD.startLine + WORLD.radius
      this.appliedCharge = clamp(charge)
      this.vy = WORLD.baseJump + this.appliedCharge * (WORLD.maxJump - WORLD.baseJump)
      this.impact(this.platforms[0], this.appliedCharge)
    }
  }

  pause() { if (this.phase === 'playing') this.phase = 'paused' }
  resume() { if (this.phase === 'paused') this.phase = 'playing' }

  tick(dt: number, input: Input) {
    if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(input.steering) || !Number.isFinite(input.charge)) return
    const duration = Math.min(dt, 0.08)
    const count = Math.ceil(duration / (1 / 120))
    const step = duration / count
    for (let i = 0; i < count; i++) {
      this.time += step
      if (this.phase === 'ready') this.updateIntro(step)
      if (this.phase === 'playing') this.advance(step, input)
      if (this.phase !== 'paused' && this.phase !== 'calibrating') this.updateEffects(step)
    }
  }

  private updateIntro(dt: number) {
    this.intro = Math.min(FEEL.introDuration, this.intro + dt)
    const t = this.intro
    // A real ballistic arc: enter from below, float, and land on the first line.
    const duration = 1.15
    const start = -65
    const end = WORLD.startLine + WORLD.radius
    const launch = (end - start + 0.5 * 900 * duration * duration) / duration
    this.introBallY = t < duration ? start + launch * t - 450 * t * t : end
    if (t >= duration && !this.introLanded) {
      this.introLanded = true
      this.impact(this.platforms[0], 0.55)
    }
  }

  private advance(dt: number, input: Input) {
    this.charge = clamp(input.charge)
    if (this.vy > 0 && this.charge > this.appliedCharge) {
      // Leaning forward during ascent adds only the unused part of this jump's
      // energy budget. Rocking back and forth cannot create an endless flight.
      const previous = WORLD.baseJump + this.appliedCharge * (WORLD.maxJump - WORLD.baseJump)
      const next = WORLD.baseJump + this.charge * (WORLD.maxJump - WORLD.baseJump)
      this.vy = Math.sqrt(this.vy * this.vy + next * next - previous * previous)
      this.appliedCharge = this.charge
    }
    this.vx += (clamp(input.steering, -1, 1) * WORLD.maxSpeed - this.vx) * (1 - Math.exp(-WORLD.response * dt))
    this.x += this.vx * dt
    if (this.x < WORLD.radius) { this.x = WORLD.radius; this.vx = 0 }
    if (this.x > this.width - WORLD.radius) { this.x = this.width - WORLD.radius; this.vx = 0 }
    const oldBottom = this.y - WORLD.radius
    this.vy -= WORLD.gravity * dt
    this.y += this.vy * dt
    if (this.vy < 0) {
      for (let i = this.platforms.length - 1; i >= 0; i--) {
        const platform = this.platforms[i]
        if (oldBottom >= platform.y && this.y - WORLD.radius <= platform.y &&
            this.x + WORLD.radius * 0.8 > platform.x && this.x - WORLD.radius * 0.8 < platform.x + platform.width) {
          this.y = platform.y + WORLD.radius
          this.appliedCharge = this.charge
          this.vy = WORLD.baseJump + this.appliedCharge * (WORLD.maxJump - WORLD.baseJump)
          this.landings++
          this.impact(platform, this.appliedCharge)
          this.onLanding?.({ x: this.x, y: platform.y, power: this.appliedCharge, count: this.landings })
          break
        }
      }
    }
    this.peak = Math.max(this.peak, this.y)
    // Camera follows new height; it never scrolls down and hides a safe landing.
    const target = Math.max(0, this.peak - WORLD.height * 0.53)
    this.camera += (target - this.camera) * (1 - Math.exp(-FEEL.cameraResponse * dt))
    this.generate()
    this.platforms = this.platforms.filter(platform => platform.y > this.camera - 100)
    this.trailTimer += dt
    if (this.trailTimer >= 1 / 60) {
      this.trailTimer = 0; this.trail.push({ x: this.x, y: this.y })
      if (this.trail.length > FEEL.trailLength) this.trail.shift()
    }
    if (this.y + WORLD.radius < this.camera - 35) this.phase = 'over'
  }

  private impact(platform: Platform, power: number) {
    platform.contact = clamp((this.x - platform.x) / platform.width, 0.1, 0.9)
    platform.displacement = 9 + power * 9
    platform.velocity = 40 + power * 50
    platform.glow = 1
    this.squash = 0.3 + power * 0.13
    this.squashVelocity = 2
    this.cameraKick = FEEL.cameraImpulse * power
    this.flash = power > 0.55 ? power * 0.18 : 0
    this.ripples.push({ x: this.x, y: platform.y, age: 0, power })
    if (this.ripples.length > 8) this.ripples.shift()
    for (let i = 0; i < 7 + Math.floor(power * 7); i++) {
      const direction = this.random() * Math.PI
      const speed = 30 + this.random() * (70 + power * 80)
      this.particles.push({ x: this.x, y: platform.y + 4, vx: Math.cos(direction) * speed,
        vy: Math.sin(direction) * speed, age: 0, life: 0.3 + this.random() * 0.35, size: 1 + this.random() * 1.4 })
    }
  }

  private updateEffects(dt: number) {
    for (const platform of this.platforms) {
      const next = spring(platform.displacement, platform.velocity, dt, FEEL.stringStiffness, FEEL.stringDamping)
      platform.displacement = next[0]; platform.velocity = next[1]
      platform.glow = Math.max(0, platform.glow - dt * 2.8)
    }
    const next = spring(this.squash, this.squashVelocity, dt, FEEL.ballStiffness, FEEL.ballDamping)
    this.squash = next[0]; this.squashVelocity = next[1]
    this.cameraKick *= Math.exp(-dt * 18); this.flash *= Math.exp(-dt * 10)
    for (const ripple of this.ripples) ripple.age += dt
    this.ripples = this.ripples.filter(ripple => ripple.age < FEEL.rippleLifetime)
    for (const particle of this.particles) {
      particle.age += dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt
      particle.vy -= 200 * dt
    }
    this.particles = this.particles.filter(particle => particle.age < particle.life)
  }

  private random() {
    this.randomState = (Math.imul(1664525, this.randomState) + 1013904223) >>> 0
    return this.randomState / 4294967296
  }

  private makePlatform(x: number, y: number, width: number): Platform {
    return { id: this.nextId++, x, y, width, displacement: 0, velocity: 0, contact: 0.5, glow: 0 }
  }

  private generate() {
    let last = this.platforms[this.platforms.length - 1]
    while (last && last.y < this.camera + WORLD.height + 260) {
      const feel = difficultyAt((last.y - WORLD.startLine) / 10)
      const gap = feel.minGap + this.random() * (feel.maxGap - feel.minGap)
      const width = Math.min(this.width - 32, feel.minWidth + this.random() * feel.widthRange)
      const lastCenter = last.x + last.width / 2
      const sweep = this.width / 2 + Math.sin(last.y / 690) * Math.max(0, this.width / 2 - width) * 0.9
      const desired = sweep + (this.random() * 2 - 1) * feel.wander
      const flight = (WORLD.baseJump + Math.sqrt(WORLD.baseJump ** 2 - 2 * WORLD.gravity * gap)) / WORLD.gravity
      const maxHop = Math.min(feel.wander, WORLD.maxSpeed * (flight - 0.2))
      const leftBound = width / 2 + 12, rightBound = this.width - width / 2 - 12
      let hop = clamp(clamp(desired, leftBound, rightBound) - lastCenter, -maxHop, maxHop)
      const minimum = Math.min(feel.minHop, maxHop)
      if (Math.abs(hop) < minimum) {
        // Later levels require active steering. Turn inward near an edge rather
        // than stacking tiny platforms against the wall or breaking reachability.
        let direction = hop < 0 ? -1 : 1
        const room = (sign: number) => Math.max(0, sign > 0 ? rightBound - lastCenter : lastCenter - leftBound)
        if (room(direction) < minimum && room(-direction) > room(direction)) direction *= -1
        hop = direction * Math.min(minimum, room(direction))
      }
      const center = clamp(lastCenter + hop, leftBound, rightBound)
      last = this.makePlatform(center - width / 2, last.y + gap, width)
      this.platforms.push(last)
    }
  }
}
