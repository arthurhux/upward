import { useState } from 'react'
import GameApp from '../GameApp.tsx'
import { FIXTURES, FixtureSession } from './fixtures.ts'
import './stress.css'

export default function StressLab() {
  const params = new URLSearchParams(location.search)
  const embedded = params.has('embedded')
  const initial = params.get('data') ?? 'demo'
  const [selected, setSelected] = useState(initial in FIXTURES ? initial : 'demo')
  const [session, setSession] = useState(() => new FixtureSession(selected))
  const [large, setLarge] = useState(false), [rtl, setRtl] = useState(false)
  const choose = (value: string) => {
    setSelected(value); setSession(new FixtureSession(value))
    const url = new URL(location.href); url.searchParams.set('data', value); history.replaceState(null, '', url)
  }
  return <><div className={`stress-stage ${embedded ? 'embedded' : ''} ${large ? 'large-type' : ''}`} dir={embedded ? undefined : rtl ? 'rtl' : 'ltr'}>
    <GameApp key={`${selected}-${large}`} providedSession={session} />
  </div>{!embedded && <nav className="stress-tools" aria-label="Development test data">
    <div role="group" aria-label="Demo data / Worst case">{Object.entries(FIXTURES).map(([key, item]) => <button key={key} aria-pressed={selected === key} onClick={() => choose(key)}>{item.label}</button>)}</div>
    <label><input type="checkbox" checked={large} onChange={event => { document.documentElement.style.fontSize = event.target.checked ? '200%' : ''; setLarge(event.target.checked) }} />200% text</label>
    <button onClick={() => { localStorage.setItem('upward.best.v1', '0'); choose(selected) }}>Reset test record</button>
    <label><input type="checkbox" checked={rtl} onChange={event => { document.documentElement.dir = event.target.checked ? 'rtl' : 'ltr'; setRtl(event.target.checked) }} />RTL</label>
  </nav>}</>
}
