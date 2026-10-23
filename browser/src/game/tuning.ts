/*
 * MOTION STORYBOARD — one landing, one connected response
 *    0 ms  collision: squash the ball, displace the string, start a ripple
 *   35 ms  string recoils; the ball stretches into its next ascent
 *  180 ms  contact glow fades; the spring keeps its remaining velocity
 *  650 ms  the ripple dissolves into the atmosphere
 *
 * Intro: the ball launches from below the viewport, lands on the first
 * string, and uses the same spring response as every playable landing.
 * Physics and steering never wait for a decorative animation to finish.
 */
export const WORLD = {
  width: 520, height: 720, radius: 18, gravity: 1170,
  baseJump: 560, maxJump: 800, maxSpeed: 310, response: 40,
  startLine: 96, minGap: 78, maxGap: 106,
} as const

export const FEEL = {
  fullTilt: 28, deadZone: 0.5, responseCurve: 1.4,
  forwardStart: 1.2, fullForward: 19,
  stringStiffness: 420, stringDamping: 14,
  ballStiffness: 540, ballDamping: 20,
  rippleLifetime: 0.65, trailLength: 18,
  cameraResponse: 12, cameraImpulse: 5,
  introDuration: 1.65, interfaceEnter: 700, interfaceSettle: 1000,
  calibrationSeconds: 2.5,
} as const

export interface Preferences {
  sensitivity: number
  jumpSensitivity: number
  reverseSteering: boolean
  reverseForward: boolean
  sound: boolean
  reducedMotion: boolean
}

export const DEFAULT_PREFERENCES: Preferences = {
  sensitivity: 0.8, jumpSensitivity: 1,
  reverseSteering: false, reverseForward: true,
  sound: false, reducedMotion: false,
}

export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))
export const easeOut = (value: number) => 1 - Math.pow(1 - clamp(value), 3)

export function steeringFromAngle(angle: number, sensitivity: number) {
  if (!Number.isFinite(angle) || !Number.isFinite(sensitivity)) return 0
  const full = FEEL.fullTilt / clamp(sensitivity, 0.6, 1.5)
  return Math.sign(angle) * Math.pow(clamp((Math.abs(angle) - FEEL.deadZone) / (full - FEEL.deadZone)), FEEL.responseCurve)
}

export function chargeFromPitch(pitch: number, sensitivity = 1) {
  if (!Number.isFinite(pitch) || !Number.isFinite(sensitivity)) return 0
  return clamp((pitch * clamp(sensitivity, 0.5, 1.6) - FEEL.forwardStart) / (FEEL.fullForward - FEEL.forwardStart))
}

export function spring(position: number, velocity: number, dt: number, stiffness: number, damping: number) {
  const nextVelocity = velocity + (-position * stiffness - velocity * damping) * dt
  return [position + nextVelocity * dt, nextVelocity] as const
}
