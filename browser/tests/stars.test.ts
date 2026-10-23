import { test } from 'node:test'
import assert from 'node:assert/strict'
import { drawStars, makeStars, SKY } from '../src/game/stars.ts'

function scene(camera: number, time: number, reduced = false) {
  const points: number[][] = []
  const context = { save() {}, restore() {}, fillStyle: '', globalAlpha: 1, beginPath() {}, fill() {},
    arc(x: number, y: number, radius: number) { points.push([x, y, radius, this.globalAlpha]) } } as unknown as CanvasRenderingContext2D
  drawStars(context, makeStars(1280, 720), 1280, 720, camera, time, reduced)
  return points
}

test('night sky is stable, bounded in density, and wraps long climbs safely', () => {
  assert.deepEqual(makeStars(1280, 720), makeStars(1280, 720))
  for (const [width, height] of [[320, 568], [1280, 720], [3440, 1440]]) {
    const stars = makeStars(width, height)
    assert.ok(stars.length >= SKY.minStars && stars.length <= SKY.maxStars)
  }
  for (const point of scene(1e9, 1e6)) {
    assert.ok(point.every(Number.isFinite))
    assert.ok(point[1] >= -4 && point[1] <= 724)
    assert.ok(point[3] > 0 && point[3] < 1)
  }
})

test('sky drifts normally but reduced motion holds both positions and brightness', () => {
  assert.notDeepEqual(scene(0, 0), scene(0, 4))
  assert.deepEqual(scene(0, 0, true), scene(10000, 40, true))
})
