import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { ArrowUp, ArrowUpRight, ArrowLeft, ArrowRight, RotateCcw, Pause, Play, Volume2, VolumeX, SlidersHorizontal, Maximize, Laptop, Keyboard, MoveUpRight, Check, MoveHorizontal, Target, Orbit, LucideProvider } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Session } from './game/session.ts'
import { JOURNEY, journeyAt, paletteAtHue } from './game/progression.ts'
import { formatCount, unitCount } from './game/format.ts'

/* ANIMATION STORYBOARD — opening the playground
 *    0 ms  the ball launches from below the viewport (Canvas physics)
 *  180 ms  title and controls settle in, without blocking keyboard input
 *  950 ms  explanatory details settle; the first line receives the ball
 * 1150 ms  first contact bends the line, squashes the ball, and releases a ring
 */
const TIMING = { reveal: 180, settle: 950 }

function IconButton({ label, children, onClick, disabled = false, active = false }: {
  label: string; children: React.ReactNode; onClick: () => void; disabled?: boolean; active?: boolean
}) {
  return <Tooltip><TooltipTrigger asChild>
    <Button variant="ghost" size="icon" className={`icon-button ${active ? 'is-active' : ''}`} aria-label={label} disabled={disabled}
      onClick={event => { onClick(); if (event.detail > 0) event.currentTarget.blur() }}>{children}</Button>
  </TooltipTrigger><TooltipContent sideOffset={10}>{label}</TooltipContent></Tooltip>
}

function SettingSlider({ id, title, description, value, min, max, onChange }: {
  id: string; title: string; description: string; value: number; min: number; max: number; onChange: (value: number) => void
}) {
  return <div className="setting-slider">
    <div className="setting-row"><label htmlFor={id}>{title}</label><span>{value.toFixed(2).replace(/0$/, '')}×</span></div>
    <p id={`${id}-description`}>{description}</p>
    <Slider id={id} aria-label={title} aria-describedby={`${id}-description`} min={min} max={max} step={0.05} value={[value]} onValueChange={values => onChange(values[0])} />
    <div className="slider-captions"><span>Gentler</span><span>Stronger</span></div>
  </div>
}

export default function GameApp({ providedSession }: { providedSession?: Session } = {}) {
  const [session] = useState(() => providedSession ?? new Session())
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [settings, setSettings] = useState(false)
  const [stage, setStage] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const touchDirection = useRef(0), touchCharge = useRef(0)
  const preferences = session.preferences
  const isReady = state.phase === 'ready'
  const isPlaying = state.phase === 'playing'
  const isOverlay = state.phase === 'paused' || state.phase === 'over'
  const connected = state.connection === 'connected'
  const journey = journeyAt(state.score)
  const colors = paletteAtHue(journey.hue, journey.color)
  const journeyStyle = { '--journey-accent': colors.accent.css, '--journey-background': colors.background.css,
    '--journey-light': colors.light.css, '--journey-surface': colors.surface.css } as CSSProperties

  useEffect(() => {
    if (!canvas.current) return
    session.start(canvas.current)
    const reveal = setTimeout(() => setStage(1), TIMING.reveal)
    const settle = setTimeout(() => setStage(2), TIMING.settle)
    const updateFullscreen = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', updateFullscreen)
    return () => {
      clearTimeout(reveal); clearTimeout(settle); session.destroy()
      document.removeEventListener('fullscreenchange', updateFullscreen)
    }
  }, [session])

  const openSettings = (open: boolean) => { setSettings(open); session.setSettingsOpen(open) }
  const play = (event: React.MouseEvent<HTMLButtonElement>) => { session.play(); if (event.detail > 0) event.currentTarget.blur() }
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch { /* Fullscreen can be restricted by an embedding page. */ }
  }

  const touchAction = (event: React.PointerEvent<HTMLButtonElement>, direction: number | null, charge: number | null) => {
    event.preventDefault()
    if (event.type === 'pointerdown') event.currentTarget.setPointerCapture(event.pointerId)
    if (direction !== null) touchDirection.current = direction
    if (charge !== null) touchCharge.current = charge
    session.touch(touchDirection.current, touchCharge.current)
  }

  return <LucideProvider size={18} strokeWidth={1.75} nonScalingStroke><TooltipProvider delayDuration={350}>
    <main style={journeyStyle} className={`playground stage-${stage} phase-${state.phase}`}>
      <canvas ref={canvas} className="game-canvas" aria-label="Pip, a red ball with two round eyes, climbs reactive lines under a quiet night sky. Tilt or use arrow keys to steer, and lean forward or hold up for lift." role="img" />

      <header className="game-header">
        <a className="wordmark" href="#" aria-label="Upward home" onClick={event => { event.preventDefault(); session.game.pause(); openSettings(false); session.game.reset() }}>
          <Orbit className="brand-symbol" aria-hidden="true" /><span>upward.</span>
        </a>
        <div className={`connection-pill ${connected ? 'connected' : ''}`}>
          <span className="status-dot" />
          <span>{connected ? 'MacBook connected' : state.connection === 'connecting' ? 'Finding your balance…' : 'Keyboard & touch ready'}</span>
        </div>
        <div className="header-actions">
          <IconButton label={preferences.sound ? 'Turn sound off' : 'Turn sound on'} active={preferences.sound}
            onClick={() => session.updatePreferences({ sound: !preferences.sound })}>{preferences.sound ? <Volume2 /> : <VolumeX />}</IconButton>
          {document.fullscreenEnabled && <IconButton label={fullscreen ? 'Exit fullscreen' : 'Go fullscreen'} onClick={toggleFullscreen}><Maximize /></IconButton>}
          <IconButton label="Settings" onClick={() => openSettings(true)}><SlidersHorizontal /></IconButton>
        </div>
      </header>

      {isReady && <section className="welcome" aria-labelledby="welcome-title">
        <h1 id="welcome-title">One more<br />bounce.</h1>
        <p className="welcome-description">Find your balance.<br /> See where it takes you.</p>
        <div className="welcome-actions"><Button className="play-button" size="lg" onClick={play}>Play</Button>
        </div>
        <div className="welcome-instructions">
          <div><span className="instruction-icon"><MoveHorizontal /></span><span>Side to side<span>Find your line</span></span></div>
          <div><span className="instruction-icon"><MoveUpRight /></span><span>Lean forward<span>Find your lift</span></span></div>
        </div>
      </section>}

      {isReady && <div className="ready-record"><span>Your personal best</span><strong>{formatCount(state.best)}<small>m</small></strong></div>}

      {state.phase === 'calibrating' && <section className="calibration-overlay" aria-live="polite">
        <span className="calibration-laptop"><Laptop size={32} /></span>
        <h2>Make yourself comfortable.</h2>
        <p>This position will be your center.</p>
        <div className="countdown-number" key={state.countdown}>{state.countdown}</div>
        <span className="calibration-caption">Then tilt to drift. Lean forward to lift.</span>
      </section>}

      {isOverlay && !settings && <section className="run-overlay" aria-labelledby="run-title">
        <div className="run-message">
        <h2 id="run-title">{state.phase === 'over' ? `${unitCount(state.score, 'meter')}.` : 'Take a breath.'}</h2>
        <p>{state.phase === 'over' ? 'There’s always one more bounce.' : 'Your next jump can wait.'}</p>
        {state.notice && <p className="run-notice" role="status">{state.notice}</p>}</div>
        <Button className="play-button" size="lg" onClick={play}>{state.phase === 'over' ? 'Play again' : 'Resume'}</Button>
        {state.phase === 'over' && <span className="run-landings">{unitCount(state.landings, 'landing')} along the way</span>}
      </section>}

      {state.milestone > 0 && isPlaying && <div key={state.milestone} className="milestone" aria-live="polite"><span>{formatCount(state.milestone)} m</span><small>{journey.name} · A little higher.</small></div>}

      <div className="bottom-region">
        <div className="control-dock" aria-label="Game controls">
          <div className="dock-altitude" role="group" aria-label={`Altitude ${unitCount(state.score, 'meter')}. Level ${journey.index + 1}: ${journey.name}.`}
            title={journey.next ? `${journey.name} · Next: ${journey.next.name} at ${formatCount(journey.next.at)} m` : `${journey.name} · Final level`}>
            <span>Altitude · {journey.index + 1}/{JOURNEY.length}</span><strong>{formatCount(state.score)}<small>m</small></strong>
            <span className="dock-progress" aria-hidden="true"><i style={{ transform: `scaleX(${journey.progress})` }} /></span>
          </div>
          <span className="dock-divider" />
          <IconButton label={isPlaying ? 'Pause · Space' : state.phase === 'paused' ? 'Resume · Space' : 'Play'}
            onClick={() => { if (isPlaying || state.phase === 'paused') session.togglePause(); else session.play() }}
            disabled={state.phase === 'calibrating'}>{isPlaying ? <Pause /> : <Play />}</IconButton>
          <IconButton label="Recenter · C" onClick={session.calibrate} disabled={!connected || state.phase === 'calibrating'}><Target /></IconButton>
          {!isReady && <IconButton label="Start again · R" onClick={session.restart}><RotateCcw /></IconButton>}
        </div>
      </div>

      {isReady && <footer className="game-footer"><button onClick={() => openSettings(true)}>How to play<ArrowUpRight aria-hidden="true" /></button><span>A little red dot. A sky to climb.</span></footer>}
      <div className="touch-controls" aria-label="Touch controls">
        <button aria-label="Move left" onPointerDown={event => touchAction(event, -1, null)} onPointerUp={event => touchAction(event, 0, null)} onPointerCancel={event => touchAction(event, 0, null)} onLostPointerCapture={() => { touchDirection.current = 0; session.touch(0, touchCharge.current) }}><ArrowLeft /></button>
        <button aria-label="Move right" onPointerDown={event => touchAction(event, 1, null)} onPointerUp={event => touchAction(event, 0, null)} onPointerCancel={event => touchAction(event, 0, null)} onLostPointerCapture={() => { touchDirection.current = 0; session.touch(0, touchCharge.current) }}><ArrowRight /></button>
        <button aria-label="Higher jump" className="touch-lift" onPointerDown={event => touchAction(event, null, 1)} onPointerUp={event => touchAction(event, null, 0)} onPointerCancel={event => touchAction(event, null, 0)} onLostPointerCapture={() => { touchCharge.current = 0; session.touch(touchDirection.current, 0) }}><ArrowUp /></button>
      </div>

      {state.notice && !isOverlay && <div className="notice-toast" role="status">{state.notice}</div>}

      <Dialog open={settings} onOpenChange={openSettings}>
        <DialogContent className="settings-content" style={journeyStyle}>
          <DialogHeader><DialogTitle>Settings</DialogTitle><DialogDescription>Make every bounce feel right.</DialogDescription></DialogHeader>
          <div className="settings-body" tabIndex={0} role="region" aria-label="Game settings">
            <section className="settings-section" aria-labelledby="controls-heading">
              <div className="section-heading"><h3 id="controls-heading">Controls</h3><p>Choose how you move.</p></div>
              <div className="settings-input" role="group" aria-label="Choose controls">
                <Button variant="ghost" aria-pressed={state.mode === 'tilt'} onClick={() => session.chooseMode('tilt')}><Laptop /><span><strong>MacBook tilt</strong><small>Move with your Mac</small></span>{state.mode === 'tilt' && <Check className="mode-check" />}</Button>
                <Button variant="ghost" aria-pressed={state.mode !== 'tilt'} onClick={() => session.chooseMode('keyboard')}><Keyboard /><span><strong>Keyboard</strong><small>Play with arrow keys</small></span>{state.mode !== 'tilt' && <Check className="mode-check" />}</Button>
              </div>
              <p className={`device-status ${connected ? 'is-connected' : ''}`}><span className="status-dot" />{connected ? 'MacBook connected · Live motion is ready.' : 'MacBook tilt needs the local launcher. Keyboard and touch are ready.'}</p>

            </section>
            <section className="settings-section" aria-labelledby="tuning-heading">
              <div className="section-heading"><h3 id="tuning-heading">Tilt tuning</h3><p>Fine-tune your MacBook’s response.</p></div>
              <div className="tuning-grid">
                <SettingSlider id="steering-sensitivity" title="Steering" description="How far a sideways tilt moves Pip." min={0.6} max={1.5} value={preferences.sensitivity} onChange={value => session.updatePreferences({ sensitivity: value })} />
                <SettingSlider id="lift-sensitivity" title="Forward lift" description="Extra jump height from leaning forward." min={0.5} max={1.6} value={preferences.jumpSensitivity} onChange={value => session.updatePreferences({ jumpSensitivity: value })} />
              </div>

            </section>
            <section className="settings-section" aria-labelledby="experience-heading">
              <div className="section-heading"><h3 id="experience-heading">Experience</h3><p>Set the mood for your climb.</p></div>
              <div className="setting-switch"><div><label htmlFor="sound">Sound</label><p>Soft notes on every landing.</p></div><Switch id="sound" checked={preferences.sound} onCheckedChange={value => session.updatePreferences({ sound: value })} /></div>

            </section>
          </div>
          <div className="settings-bottom"><span><kbd>Space</kbd> pause <kbd>C</kbd> recenter <kbd>R</kbd> restart</span><Button onClick={() => openSettings(false)}>Done</Button></div>
        </DialogContent>
      </Dialog>
    </main>
  </TooltipProvider></LucideProvider>
}
