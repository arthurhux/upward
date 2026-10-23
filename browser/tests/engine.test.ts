import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Engine } from '../src/game/engine.ts'
import { WORLD, chargeFromPitch, steeringFromAngle } from '../src/game/tuning.ts'

const neutral = { steering: 0, charge: 0 }

test('opening ball enters from below and actually reacts on its first landing', () => {
  const game = new Engine(4)
  assert.ok(game.introBallY < 0)
  for (let i = 0; i < 140; i++) game.tick(1 / 120, neutral)
  assert.equal(game.introLanded, true)
  assert.equal(game.introBallY, WORLD.startLine + WORLD.radius)
  assert.ok(game.platforms[0].displacement > 0)
  assert.ok(game.ripples.length > 0)
  assert.equal(game.phase, 'ready')
})

test('small forward tilt gives a little lift, stronger tilt gives more, with a cap', () => {
  assert.equal(chargeFromPitch(-10), 0)
  assert.equal(chargeFromPitch(0), 0)
  assert.ok(chargeFromPitch(5) > 0)
  assert.ok(chargeFromPitch(15) > chargeFromPitch(5))
  assert.equal(chargeFromPitch(100), 1)
  assert.equal(chargeFromPitch(Number.NaN), 0)
  assert.ok(chargeFromPitch(8, 1.4) > chargeFromPitch(8, 0.6))
})

function firstJumpHeight(charge: number) {
  const game = new Engine(12)
  game.start()
  for (let i = 0; i < 200; i++) {
    game.tick(1 / 120, { steering: 0, charge })
    if (game.vy <= 0) break
  }
  return game.peak
}

test('forward tilt changes the actual first-jump apex, not just an effect', () => {
  const base = firstJumpHeight(0)
  const gentle = firstJumpHeight(0.25)
  const strong = firstJumpHeight(1)
  assert.ok(gentle > base + 20)
  assert.ok(strong > gentle + 80)
})

test('forward tilt can add lift immediately during ascent without repeated pumping', () => {
  const game = new Engine(4)
  game.start(); game.tick(0.1, neutral)
  const oldVelocity = game.vy
  game.tick(1 / 120, { steering: 0, charge: 1 })
  assert.ok(game.vy > oldVelocity + 150)
  for (let i = 0; i < 200; i++) {
    game.tick(1 / 120, { steering: 0, charge: i % 2 })
    if (game.vy <= 0) break
  }
  const theoreticalMax = WORLD.startLine + WORLD.radius + WORLD.maxJump ** 2 / (2 * WORLD.gravity)
  assert.ok(game.peak <= theoreticalMax + 1, 'Rocking the laptop must not create unlimited flight')
})

test('contact bends the hit line and squashes the ball in the same physics step', () => {
  const game = new Engine(1)
  game.start()
  const platform = game.platforms[0]
  game.x = platform.x + platform.width / 2
  game.y = platform.y + WORLD.radius + 1
  game.vy = -150
  game.tick(1 / 120, { steering: 0, charge: 0.8 })
  assert.equal(game.landings, 1)
  assert.ok(game.vy > WORLD.baseJump)
  assert.ok(platform.displacement > 0)
  assert.ok(game.squash > 0)
  assert.ok(platform.glow > 0)
  assert.ok(game.particles.length > 0)
})

test('spring effects settle and do not keep accumulating', () => {
  const game = new Engine(1)
  game.start(1)
  game.phase = 'over'
  for (let i = 0; i < 240; i++) game.tick(1 / 120, neutral)
  assert.ok(Math.abs(game.platforms[0].displacement) < 0.001)
  assert.ok(Math.abs(game.squash) < 0.001)
  assert.equal(game.ripples.length, 0)
  assert.equal(game.particles.length, 0)
})

test('steering is gentle near neutral and responds and brakes promptly', () => {
  assert.equal(steeringFromAngle(0, 0.8), 0)
  assert.ok(steeringFromAngle(5, 0.8) < 0.1)
  assert.equal(steeringFromAngle(100, 0.8), 1)
  const game = new Engine(1)
  game.start(); game.tick(0.05, { steering: 1, charge: 0 })
  assert.ok(game.vx > WORLD.maxSpeed * 0.8)
  game.tick(0.05, neutral)
  assert.ok(game.vx < WORLD.maxSpeed * 0.2)
})

test('every generated line is reachable without requiring a charged jump', () => {
  for (let seed = 1; seed < 101; seed++) {
    const game = new Engine(seed)
    for (let i = 1; i < game.platforms.length; i++) {
      const a = game.platforms[i - 1], b = game.platforms[i]
      const rise = b.y - a.y
      assert.ok(rise < WORLD.baseJump ** 2 / (2 * WORLD.gravity))
      const time = (WORLD.baseJump + Math.sqrt(WORLD.baseJump ** 2 - 2 * WORLD.gravity * rise)) / WORLD.gravity
      assert.ok(Math.abs(b.x + b.width / 2 - a.x - a.width / 2) < WORLD.maxSpeed * (time - 0.12))
      assert.ok(b.x >= 0 && b.x + b.width <= WORLD.width)
    }
  }
})

test('a minute-long climb works and recycles offscreen platforms and effects', () => {
  const game = new Engine(42)
  game.start()
  let target = game.platforms[1], landings = 0, score = 0
  for (let i = 0; i < 7200; i++) {
    game.tick(1 / 120, { steering: Math.max(-1, Math.min(1, (target.x + target.width / 2 - game.x) / 55)), charge: 0 })
    if (game.landings !== landings) {
      landings = game.landings
      const landed = [...game.platforms].sort((a, b) => Math.abs(a.y - game.y + WORLD.radius) - Math.abs(b.y - game.y + WORLD.radius))[0]
      target = game.platforms.find(platform => platform.y > landed.y + 1) || target
    }
    assert.ok(game.score >= score); score = game.score
    if (game.phase === 'over') break
  }
  assert.equal(game.phase, 'playing')
  assert.ok(game.score > 450)
  assert.ok(game.landings > 50)
  assert.ok(game.platforms.length < 18)
  assert.ok(game.trail.length <= 18)
  assert.ok(game.particles.length < 50)
})

test('pause freezes game and effect positions; restart clears the run', () => {
  const game = new Engine(8)
  game.start(); game.tick(0.05, { steering: 1, charge: 0.6 }); game.pause()
  const saved = [game.x, game.y, game.squash]
  game.tick(0.05, neutral)
  assert.deepEqual([game.x, game.y, game.squash], saved)
  game.resume(); game.tick(0.01, neutral)
  assert.notEqual(game.y, saved[1])
  game.reset()
  assert.equal(game.phase, 'ready'); assert.equal(game.score, 0); assert.equal(game.landings, 0)
})

test('falling off the screen ends the run and invalid inputs cannot corrupt it', () => {
  const game = new Engine(8)
  game.start()
  game.tick(Number.NaN, neutral); game.tick(0.01, { steering: Number.POSITIVE_INFINITY, charge: 0 })
  assert.equal(game.y, WORLD.startLine + WORLD.radius)
  game.y = -100; game.vy = -50
  game.tick(1 / 120, neutral)
  assert.equal(game.phase, 'over')
})
