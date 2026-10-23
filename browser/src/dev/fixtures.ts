import { Session, type Snapshot } from '../game/session.ts'
import { WORLD } from '../game/tuning.ts'
import { JOURNEY, JOURNEY_FEEL } from '../game/progression.ts'
import { difficultyAt } from '../game/progression.ts'

export const FIXTURES: Record<string, { label: string; state: Partial<Snapshot>; stageScore?: number; empty?: boolean }> = {
  demo: { label: 'Demo data', state: { phase: 'paused', score: 64, best: 1284, landings: 7, mode: 'keyboard', connection: 'connected' }, stageScore: 64 },
  worst: { label: 'Worst case', state: { phase: 'over', score: 999999, best: 1000000, landings: 1284, mode: 'keyboard', connection: 'unavailable', steering: -1, charge: 1, notice: 'Tilt disconnected. Reconnect your MacBook or choose keyboard controls to continue your climb.' }, stageScore: 999999 },
  empty: { label: 'Empty', state: { phase: 'ready', score: 0, best: 0, landings: 0, connection: 'unavailable', mode: 'keyboard', notice: '' }, empty: true },
  one: { label: 'One', state: { phase: 'over', score: 1, best: 1, landings: 1, connection: 'connected', mode: 'keyboard', notice: '' }, stageScore: 1 },
  calibration: { label: 'Calibrating', state: { phase: 'calibrating', score: 0, best: 1284, countdown: 1, connection: 'connected', mode: 'tilt' } },
  ...Object.fromEntries(JOURNEY.map(stage => {
    const score = stage.at + JOURNEY_FEEL.colorDistance
    return [stage.name.toLowerCase(), { label: stage.name,
      state: { phase: 'paused', score, best: 15000, landings: Math.round(score / 10), mode: 'keyboard', connection: 'connected' }, stageScore: score }]
  })),
}

// Fixtures enter through the same immutable Snapshot boundary as live play.
// No DOM text replacement and no writes of test scores to local storage.
export class FixtureSession extends Session {
  constructor(key: string) {
    super({ persist: false })
    const fixture = FIXTURES[key] ?? FIXTURES.demo
    const liveSnapshot = this.getSnapshot
    let previous: Snapshot | undefined, merged: Snapshot
    this.getSnapshot = () => {
      const snapshot = liveSnapshot()
      if (snapshot !== previous) { previous = snapshot; merged = { ...snapshot, ...fixture.state } }
      return merged
    }
    const start = this.start.bind(this)
    this.start = canvas => {
      this.game.reset()
      start(canvas)
      this.game.phase = fixture.state.phase === 'ready' && !fixture.empty ? 'ready' : 'paused'
      const score = fixture.stageScore ?? 0
      this.game.peak = WORLD.startLine + WORLD.radius + score * 10
      this.game.camera = Math.max(0, this.game.peak - WORLD.height * 0.53)
      this.game.y = this.game.camera + WORLD.height * 0.38
      if (fixture.empty) this.game.platforms = []
      else if (fixture.stageScore !== undefined) {
        // Generate from the actual altitude profile, rather than shifting the
        // beginner route upward. Color previews must show the real difficulty.
        const base = this.game.platforms[0], feel = difficultyAt(score)
        base.width = Math.min(this.game.width - 32, feel.minWidth + feel.widthRange / 2)
        base.x = Math.max(12, Math.min(this.game.width - base.width - 12, this.game.x - base.width / 2))
        base.y = this.game.y - WORLD.radius
        this.game.platforms = [base]; this.game.vy = 0; this.game.phase = 'playing'
        this.game.tick(1 / 120, { steering: 0, charge: 0 })
        this.game.phase = 'paused'
      } else for (const platform of this.game.platforms) platform.y += this.game.camera
    }
  }
}
