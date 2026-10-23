import { Engine, type Phase } from './engine.ts'
import { Renderer } from './renderer.ts'
import { MotionLink, type Connection } from './motion.ts'
import { GameAudio } from './audio.ts'
import { journeyAt, viewportWorld } from './progression.ts'
import { chargeFromPitch, steeringFromAngle, DEFAULT_PREFERENCES, FEEL, clamp, type Preferences } from './tuning.ts'

export type Mode = 'tilt' | 'keyboard' | 'touch'
export interface Snapshot {
  phase: Phase; score: number; best: number; landings: number
  steering: number; charge: number; connection: Connection; mode: Mode
  countdown: number; notice: string; milestone: number
}

function readPreferences(): Preferences {
  try {
    const stored = JSON.parse(localStorage.getItem('upward.preferences.v1') || '{}')
    return { ...DEFAULT_PREFERENCES,
      sensitivity: typeof stored.sensitivity === 'number' ? clamp(stored.sensitivity, 0.6, 1.5) : 0.8,
      jumpSensitivity: typeof stored.jumpSensitivity === 'number' ? clamp(stored.jumpSensitivity, 0.5, 1.6) : 1,
      // Direction is now fixed; ignore legacy reversal switches saved by older builds.
      reverseSteering: DEFAULT_PREFERENCES.reverseSteering, reverseForward: DEFAULT_PREFERENCES.reverseForward,
      sound: stored.sound === true, reducedMotion: stored.reducedMotion === true,
    }
  } catch { return { ...DEFAULT_PREFERENCES } }
}

function readBest() { try { return Math.max(0, Number(localStorage.getItem('upward.best.v1')) || 0) } catch { return 0 } }
function angleDelta(a: number, b: number) { return ((a - b + 540) % 360) - 180 }

export class Session {
  readonly game = new Engine()
  readonly motion = new MotionLink()
  readonly audio = new GameAudio()
  preferences = readPreferences()
  private snapshot: Snapshot = { phase: 'ready', score: 0, best: readBest(), landings: 0, steering: 0,
    charge: 0, connection: 'connecting', mode: 'keyboard', countdown: 0, notice: '', milestone: 0 }
  private listeners = new Set<() => void>()
  private keys = new Set<string>()
  private mode: Mode = 'keyboard'
  private modeChosen = false
  private neutralRoll = 0
  private neutralPitch = 0
  private pointerSteering = 0
  private pointerCharge = 0
  private raf = 0
  private previousTime = 0
  private lastPublish = 0
  private renderer?: Renderer
  private canvas?: HTMLCanvasElement
  private countdownEnd = 0
  private calibrationResumes = false
  private calibrationSamples: { roll: number; pitch: number; at: number }[] = []
  private settingsOpen = false
  private notice = ''
  private noticeUntil = 0
  private best = readBest()
  private savedBest = this.best
  private milestone = 0
  private systemReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  private lastInput = { steering: 0, charge: 0 }
  private persistence: boolean

  constructor({ persist = true }: { persist?: boolean } = {}) { this.persistence = persist }

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getSnapshot = () => this.snapshot

  start(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new Renderer(canvas)
    this.resize()
    this.audio.enabled = this.preferences.sound
    this.game.onLanding = event => this.audio.landing(event.power, event.count)
    this.motion.onStatus = status => {
      if (status === 'connected' && !this.modeChosen && this.game.phase === 'ready') this.mode = 'tilt'
      this.publish()
    }
    this.motion.connect()
    window.addEventListener('resize', this.resize)
    window.addEventListener('keydown', this.keyDown)
    window.addEventListener('keyup', this.keyUp)
    window.addEventListener('blur', this.focusLost)
    document.addEventListener('visibilitychange', this.visibilityChanged)
    this.previousTime = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  private resize = () => {
    const element = this.canvas?.parentElement
    const viewWidth = element?.clientWidth || window.innerWidth
    const viewHeight = element?.clientHeight || window.innerHeight
    const { width } = viewportWorld(viewWidth, viewHeight)
    this.game.resizeWorld(width, viewWidth > 900 ? 0.68 : 0.5)
    this.renderer?.resize(viewWidth, viewHeight)
  }
  private visibilityChanged = () => { if (document.hidden) this.focusLost() }
  private focusLost = () => {
    this.keys.clear(); this.pointerSteering = 0; this.pointerCharge = 0
    if (this.game.phase === 'calibrating') {
      this.game.phase = this.calibrationResumes ? 'paused' : 'ready'
      this.countdownEnd = 0; this.flashNotice('Calibration paused. Get comfortable and try again.')
    }
    this.game.pause(); this.publish()
  }

  private frame = (time: number) => {
    const dt = Math.min(0.05, Math.max(0, (time - this.previousTime) / 1000))
    this.previousTime = time
    if (this.game.phase === 'calibrating') {
      if (!this.motion.isLive) {
        this.countdownEnd = 0; this.game.phase = this.calibrationResumes ? 'paused' : 'ready'
        this.flashNotice('Tilt disconnected. Reconnect or choose keyboard controls.')
      } else {
        const orientation = this.motion.orientation
        this.calibrationSamples.push({ roll: orientation.roll, pitch: orientation.pitch, at: time })
        this.calibrationSamples = this.calibrationSamples.filter(sample => sample.at > time - 650)
        if (time >= this.countdownEnd) this.finishCalibration()
      }
    }
    if (this.game.phase === 'playing' && this.mode === 'tilt' && !this.motion.isLive) {
      this.game.pause(); this.flashNotice('Tilt disconnected. Your climb is paused.')
    }
    this.lastInput = this.input()
    this.game.tick(dt, this.lastInput)
    this.renderer?.draw(this.game, dt, this.preferences.reducedMotion || this.systemReducedMotion.matches)
    if (this.game.score > this.best) this.best = this.game.score
    const newMilestone = journeyAt(this.game.score).at
    if (newMilestone > this.milestone) this.milestone = newMilestone
    if (time - this.lastPublish > 80 || this.game.phase !== this.snapshot.phase) {
      this.lastPublish = time; this.publish()
    }
    this.raf = requestAnimationFrame(this.frame)
  }

  private input() {
    const left = this.keys.has('ArrowLeft') || this.keys.has('KeyA')
    const right = this.keys.has('ArrowRight') || this.keys.has('KeyD')
    let steering = this.pointerSteering
    let charge = this.pointerCharge
    if (this.mode === 'tilt' && this.motion.isLive) {
      steering = steeringFromAngle(angleDelta(this.motion.orientation.roll, this.neutralRoll), this.preferences.sensitivity) * (this.preferences.reverseSteering ? -1 : 1)
      charge = chargeFromPitch((this.motion.orientation.pitch - this.neutralPitch) * (this.preferences.reverseForward ? -1 : 1), this.preferences.jumpSensitivity)
    }
    if (left || right) steering = Number(right) - Number(left)
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) charge = 1
    return { steering, charge }
  }

  play = () => {
    this.audio.unlock()
    if (this.game.phase === 'paused') {
      if (this.mode === 'tilt' && !this.motion.isLive) { this.flashNotice('Choose keyboard or reconnect tilt to continue.'); return }
      this.game.resume(); this.publish(); return
    }
    if (this.game.phase === 'over') { this.saveBest(); this.game.reset(); this.milestone = 0 }
    if (this.mode === 'tilt' && this.motion.isLive) this.calibrate()
    else { this.game.start(); this.publish() }
  }

  calibrate = () => {
    if (!this.motion.isLive) { this.flashNotice('Start the local launcher to connect your MacBook.'); return }
    this.audio.unlock(); this.keys.clear(); this.mode = 'tilt'; this.modeChosen = true
    this.calibrationResumes = this.game.phase === 'playing' || this.game.phase === 'paused'
    this.game.phase = 'calibrating'; this.countdownEnd = performance.now() + FEEL.calibrationSeconds * 1000
    this.calibrationSamples = []; this.publish()
  }

  private finishCalibration() {
    const samples = this.calibrationSamples
    if (!samples.length) return
    const sin = samples.reduce((sum, sample) => sum + Math.sin(sample.roll * Math.PI / 180), 0)
    const cos = samples.reduce((sum, sample) => sum + Math.cos(sample.roll * Math.PI / 180), 0)
    this.neutralRoll = Math.atan2(sin, cos) * 180 / Math.PI
    this.neutralPitch = samples.reduce((sum, sample) => sum + sample.pitch, 0) / samples.length
    this.countdownEnd = 0
    if (this.calibrationResumes) { this.game.phase = 'paused'; this.game.resume() }
    else { this.game.phase = 'ready'; this.game.start() }
    this.publish()
  }

  togglePause = () => {
    if (this.game.phase === 'playing') { this.game.pause(); this.keys.clear(); this.saveBest() }
    else if (this.game.phase === 'paused') this.play()
    this.publish()
  }

  restart = () => {
    this.saveBest(); this.keys.clear(); this.game.reset(); this.milestone = 0
    this.countdownEnd = 0; this.notice = ''; this.play()
  }

  chooseMode = (mode: Mode) => {
    if (mode === 'tilt' && !this.motion.isLive) { this.flashNotice('MacBook tilt needs the local launcher. Keyboard and touch work anywhere.'); return }
    this.mode = mode; this.modeChosen = true; this.keys.clear()
    if (mode === 'tilt' && (this.game.phase === 'playing' || this.game.phase === 'paused')) this.calibrate()
    this.publish()
  }

  updatePreferences = (patch: Partial<Preferences>) => {
    this.preferences = { ...this.preferences, ...patch }
    this.audio.enabled = this.preferences.sound
    if (this.audio.enabled) this.audio.unlock()
    try { if (this.persistence) localStorage.setItem('upward.preferences.v1', JSON.stringify(this.preferences)) } catch { /* Private mode still plays. */ }
    this.publish()
  }

  setSettingsOpen = (open: boolean) => {
    this.settingsOpen = open
    if (open) { this.game.pause(); this.keys.clear() }
    this.publish()
  }

  touch = (direction: number, charge: number) => {
    this.mode = 'touch'; this.modeChosen = true
    this.pointerSteering = direction; this.pointerCharge = charge
    this.audio.unlock()
  }

  private keyDown = (event: KeyboardEvent) => {
    if (this.settingsOpen || (event.target instanceof Element && event.target.closest('input,textarea,button,[role="slider"],[role="dialog"]'))) return
    const controls = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'KeyA', 'KeyD', 'KeyW', 'Space', 'Enter', 'Escape', 'KeyC', 'KeyR']
    if (!controls.includes(event.code) || event.metaKey || event.ctrlKey || event.altKey) return
    event.preventDefault()
    this.audio.unlock(); this.keys.add(event.code)
    if (event.repeat) return
    if (event.code === 'Space') {
      if (this.game.phase === 'ready' || this.game.phase === 'over') this.play()
      else this.togglePause()
    }
    if (event.code === 'Enter' && this.game.phase !== 'playing') this.play()
    if (event.code === 'Escape') { this.game.pause(); this.publish() }
    if (event.code === 'KeyC') this.calibrate()
    if (event.code === 'KeyR') this.restart()
  }
  private keyUp = (event: KeyboardEvent) => { this.keys.delete(event.code) }

  private flashNotice(message: string) { this.notice = message; this.noticeUntil = performance.now() + 4500; this.publish() }
  private saveBest() {
    if (!this.persistence || this.best <= this.savedBest) return
    this.savedBest = this.best
    try { localStorage.setItem('upward.best.v1', String(this.best)) } catch { /* Storage is optional. */ }
  }

  private publish() {
    this.snapshot = { phase: this.game.phase, score: this.game.score, best: this.best,
      landings: this.game.landings, steering: this.lastInput.steering, charge: this.lastInput.charge,
      connection: this.motion.isLive ? 'connected' : this.motion.status, mode: this.mode,
      countdown: this.countdownEnd ? Math.max(1, Math.ceil((this.countdownEnd - performance.now()) / 1000)) : 0,
      notice: performance.now() < this.noticeUntil ? this.notice : '', milestone: this.milestone }
    if (this.game.phase === 'over') this.saveBest()
    for (const listener of this.listeners) listener()
  }

  destroy() {
    cancelAnimationFrame(this.raf); this.saveBest(); this.motion.close(); this.audio.close()
    window.removeEventListener('resize', this.resize)
    window.removeEventListener('keydown', this.keyDown); window.removeEventListener('keyup', this.keyUp)
    window.removeEventListener('blur', this.focusLost); document.removeEventListener('visibilitychange', this.visibilityChanged)
  }
}
