import { test } from 'node:test'
import assert from 'node:assert/strict'
import { converter, wcagContrast, displayable } from 'culori'
import { Engine } from '../src/game/engine.ts'
import { WORLD } from '../src/game/tuning.ts'
import { JOURNEY, JOURNEY_FEEL, LEVEL_ROUTES, ROUTE_LIMITS, difficultyAt, journeyAt, paletteAtHue, viewportWorld } from '../src/game/progression.ts'

const rgb = converter('rgb')
test('world bounds project to the full viewport at phone, laptop and ultrawide sizes', () => {
  for (const [width, height] of [[320,568],[390,844],[1512,982],[2560,1440],[3440,1440]]) {
    const view = viewportWorld(width, height)
    assert.ok(Math.abs(view.width * view.scale - width) < 0.001)
    const game = new Engine(17); game.resizeWorld(view.width); game.start()
    for (let i=0;i<2400;i++) { game.y = 300; game.vy = 500; game.tick(1/120,{steering:1,charge:0}) }
    assert.ok(game.x > view.width - WORLD.radius - 1)
    assert.ok(Math.abs(game.x * view.scale - (width - WORLD.radius * view.scale)) < 0.01)
  }
})

test('difficulty increases vertical spacing and reduces line width without unlimited escalation', () => {
  const easy = difficultyAt(0), hard = difficultyAt(JOURNEY[JOURNEY.length - 1].at + JOURNEY_FEEL.difficultyBlendDistance), later = difficultyAt(1000000)
  assert.ok(hard.minGap > easy.maxGap)
  assert.ok(hard.minWidth + hard.widthRange < easy.minWidth)
  assert.deepEqual(later, hard)
  assert.ok(hard.maxGap < WORLD.baseJump ** 2 / (2 * WORLD.gravity) - 4)
})

test('each level compounds the requested reductions up to the approved practical limits', () => {
  assert.equal(LEVEL_ROUTES.length, JOURNEY.length)
  assert.deepEqual(difficultyAt(0), difficultyAt(499))
  assert.deepEqual(difficultyAt(Number.NaN), difficultyAt(0))
  for (let i = 1; i < JOURNEY.length; i++) {
    const at = JOURNEY[i].at
    const before = difficultyAt(at - 1), boundary = difficultyAt(at)
    const half = difficultyAt(at + JOURNEY_FEEL.difficultyBlendDistance / 2)
    const after = difficultyAt(at + JOURNEY_FEEL.difficultyBlendDistance)
    assert.deepEqual(before, boundary)
    assert.ok(after.minGap >= before.minGap && after.maxGap >= before.maxGap)
    assert.ok(after.minWidth + after.widthRange <= before.minWidth + before.widthRange)
    assert.ok(Math.abs(after.maxGap - Math.min(ROUTE_LIMITS.maxGap, 80 / (.7 ** i))) < .00001)
    assert.ok(Math.abs(after.minWidth - Math.max(ROUTE_LIMITS.minWidth, 174 * (.5 ** i))) < .00001)
    assert.ok(Math.abs(half.maxGap - (before.maxGap + after.maxGap) / 2) < .00001)
    assert.ok(after.minWidth >= ROUTE_LIMITS.minWidth)
    assert.ok(after.minHop > before.minHop)
    assert.ok(after.maxGap < WORLD.baseJump ** 2 / (2 * WORLD.gravity) - 4)
  }
})

test('level two sharply reduces safe landing area and requires sideways hops', () => {
  const easy = difficultyAt(0), second = difficultyAt(500 + JOURNEY_FEEL.difficultyBlendDistance)
  assert.equal(second.minWidth, easy.minWidth * .5)
  assert.equal(second.widthRange, easy.widthRange * .5)
  assert.ok(Math.abs((easy.minGap + easy.maxGap) / (second.minGap + second.maxGap) - .7) < .00001)
  assert.ok(second.minHop >= 100)
  for (const width of [360, 1450, 2600]) for (let seed = 1; seed <= 40; seed++) {
    const game = new Engine(seed); game.resizeWorld(width)
    const base = game.platforms[0]; base.y += 600 * 10; base.x = width / 2 - base.width / 2
    game.platforms = [base]; game.camera = 600 * 10; game.start()
    game.y = base.y + WORLD.radius; game.peak = game.y
    game.tick(1 / 120, { steering: 0, charge: 0 })
    for (let i = 1; i < game.platforms.length; i++) {
      const a = game.platforms[i - 1], b = game.platforms[i]
      assert.ok(Math.abs(b.x + b.width / 2 - a.x - a.width / 2) >= 100 - .001)
    }
  }
})

test('later routes have fewer generated lines over the same vertical distance', () => {
  function countAt(meters: number) {
    let total = 0
    for (let seed = 1; seed <= 40; seed++) {
      const game = new Engine(seed), base = game.platforms[0]
      base.y += meters * 10; game.platforms = [base]; game.camera = meters * 10
      game.start(); game.y = base.y + WORLD.radius; game.peak = game.y
      game.tick(1 / 120, { steering: 0, charge: 0 })
      total += game.platforms.length
    }
    return total
  }
  assert.ok(countAt(13000) < countAt(0) * .75)
})

test('generated routes stay reachable at all stages and full-screen widths', () => {
  for (const width of [360,520,1450,2600]) for (const meters of [...JOURNEY.flatMap(stage => [stage.at, stage.at + JOURNEY_FEEL.difficultyBlendDistance]),1000000]) for (let seed=1;seed<=40;seed++) {
    const game = new Engine(seed); game.resizeWorld(width)
    const base = game.platforms[0]
    base.x = width / 2 - base.width / 2; base.y += meters * 10
    game.platforms = [base]; game.camera = meters * 10; game.start()
    game.y = base.y + WORLD.radius; game.peak = game.y
    game.tick(1/120,{steering:0,charge:0})
    for (let i=1;i<game.platforms.length;i++) {
      const a=game.platforms[i-1], b=game.platforms[i], gap=b.y-a.y
      const flight=(WORLD.baseJump+Math.sqrt(WORLD.baseJump**2-2*WORLD.gravity*gap))/WORLD.gravity
      assert.ok(gap < WORLD.baseJump**2/(2*WORLD.gravity))
      assert.ok(Math.abs(b.x+b.width/2-a.x-a.width/2) <= WORLD.maxSpeed*(flight-.12)+.001)
      assert.ok(b.x>=0 && b.x+b.width<=width)
    }
  }
})

test('resizing a live climb keeps the ball, lines and effects in a finite world', () => {
  const game = new Engine(7); game.resizeWorld(1600); game.start(1)
  for(let i=0;i<30;i++)game.tick(1/120,{steering:1,charge:1})
  game.resizeWorld(360)
  assert.ok(game.x>=WORLD.radius && game.x<=360-WORLD.radius)
  assert.ok(game.platforms.every(p=>p.x>=0 && p.x+p.width<=360))
  assert.ok([...game.trail,...game.particles,...game.ripples].every(p=>Number.isFinite(p.x)))
  game.resizeWorld(2000); assert.equal(game.width,2000)
})

test('longer spectrum stages unlock at exact thresholds with continuous transitions', () => {
  assert.equal(journeyAt(Number.NaN).name, 'Midnight')
  assert.equal(journeyAt(499).name, 'Midnight')
  assert.equal(JOURNEY.length, 10)
  let priorGap = 0
  for (let i = 1; i < JOURNEY.length; i++) {
    const stage = JOURNEY[i], previous = JOURNEY[i - 1]
    const gap = stage.at - previous.at
    assert.ok(gap > priorGap); priorGap = gap
    assert.equal(journeyAt(stage.at - 1).index, i - 1)
    assert.equal(journeyAt(stage.at).index, i)
    assert.equal(journeyAt(stage.at).hue, previous.hue)
    assert.equal(journeyAt(stage.at + JOURNEY_FEEL.colorDistance).hue, stage.hue)
    assert.equal(journeyAt(stage.at).progress, i === JOURNEY.length - 1 ? 1 : 0)
  }
  const black = journeyAt(0), p = paletteAtHue(black.hue, black.color)
  assert.ok(p.background.rgb.every(channel => channel > 0 && channel < 24))
  assert.ok(Math.abs(p.background.rgb[0] - p.background.rgb[1]) < 1e-8)
  assert.ok(Math.abs(p.background.rgb[1] - p.background.rgb[2]) < 1e-8)
  assert.deepEqual(p.atmosphere.rgb, [0, 0, 0])
  for (const score of [500, 575, 650]) {
    const level = journeyAt(score), palette = paletteAtHue(level.hue, level.color)
    assert.ok(wcagContrast(palette.secondary.css, palette.background.css) >= 4.5)
  }
})

test('neighboring levels retain contrasting hues with a subtle dark sky tint', () => {
  for (let i = 2; i < JOURNEY.length; i++) {
    const previous = JOURNEY[i - 1], current = JOURNEY[i]
    const distance = Math.abs(((current.hue - previous.hue + 540) % 360) - 180)
    assert.ok(distance >= 80)
    const a = rgb(paletteAtHue(previous.hue).background.css)!, b = rgb(paletteAtHue(current.hue).background.css)!
    assert.ok(Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) > .01)
    const palette = paletteAtHue(current.hue)
    assert.ok(wcagContrast(palette.text.css, palette.background.css) > 15)
  }
})

test('all generated OKLCH hues are sRGB-safe and maintain readable semantic pairs', () => {
  for(let hue=0;hue<360;hue++) {
    const p=paletteAtHue(hue)
    for(const tone of Object.values(p)) {
      const c=rgb(tone.css)!
      assert.ok(c.r>=-0.00001 && c.r<=1.00001 && c.g>=-0.00001 && c.g<=1.00001 && c.b>=-0.00001 && c.b<=1.00001)
      assert.ok(displayable({mode:'rgb',r:Math.max(0,Math.min(c.r,1)),g:Math.max(0,Math.min(c.g,1)),b:Math.max(0,Math.min(c.b,1))}))
    }
    assert.ok(wcagContrast(p.secondary.css,p.background.css)>=4.5)
    assert.ok(wcagContrast(p.secondary.css,p.surface.css)>=4.5)
    assert.ok(wcagContrast(p.text.css,p.surface.css)>=7)
    assert.ok(wcagContrast(p.face.css,p.glint.css)>=7)
  }
})

test('a long unassisted route can cross every difficulty and color stage on a wide screen', () => {
  const game=new Engine(42); game.resizeWorld(viewportWorld(1920,1080).width);game.start()
  let target=game.platforms[1],lastLanding=0
  for(let i=0;i<300000;i++) {
    game.tick(1/120,{steering:Math.max(-1,Math.min(1,(target.x+target.width/2-game.x)/55)),charge:0})
    if(game.landings!==lastLanding){lastLanding=game.landings;const landed=[...game.platforms].sort((a,b)=>Math.abs(a.y-game.y+WORLD.radius)-Math.abs(b.y-game.y+WORLD.radius))[0];target=game.platforms.find(p=>p.y>landed.y+1)||target}
    if(game.phase==='over' || game.score >= JOURNEY[JOURNEY.length - 1].at + JOURNEY_FEEL.colorDistance)break
  }
  assert.equal(game.phase,'playing');assert.ok(game.score>=JOURNEY[JOURNEY.length - 1].at + JOURNEY_FEEL.colorDistance)
  assert.ok(game.platforms.length<18);assert.ok(game.particles.length<60)
})

test('display counters group large values and use singular units', async () => {
  const {formatCount,unitCount}=await import('../src/game/format.ts')
  assert.equal(formatCount(1000000),new Intl.NumberFormat(undefined,{maximumFractionDigits:0}).format(1000000))
  assert.equal(unitCount(1,'meter'),'1 meter');assert.equal(unitCount(1,'landing'),'1 landing')
  assert.equal(unitCount(0,'landing'),'0 landings');assert.equal(unitCount(2,'meter'),'2 meters')
  assert.equal(formatCount(Number.POSITIVE_INFINITY),'0')
})

test('preview preference edits stay isolated while live preferences still persist', async () => {
  const priorWindow=globalThis.window, priorStorage=globalThis.localStorage
  const writes: string[]=[]
  Object.defineProperty(globalThis,'window',{configurable:true,value:{matchMedia:()=>({matches:false})}})
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>key==='upward.preferences.v1'?JSON.stringify({reverseForward:false,reverseSteering:true}):null,setItem:(key:string)=>writes.push(key)}})
  try {
    const {Session}=await import('../src/game/session.ts')
    const preview=new Session({persist:false})
    assert.equal(preview.preferences.reverseForward,true)
    assert.equal(preview.preferences.reverseSteering,false)
    preview.updatePreferences({sensitivity:1})
    assert.deepEqual(writes,[])
    const live=new Session();live.updatePreferences({sensitivity:.8})
    assert.deepEqual(writes,['upward.preferences.v1'])
  } finally {
    Object.defineProperty(globalThis,'window',{configurable:true,value:priorWindow})
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:priorStorage})
  }
})
