export interface Orientation { roll: number; pitch: number; receivedAt: number }
export type Connection = 'connecting' | 'connected' | 'unavailable'

export class MotionLink {
  orientation: Orientation = { roll: 0, pitch: 0, receivedAt: -Infinity }
  status: Connection = 'connecting'
  private source?: EventSource
  private timeout?: ReturnType<typeof setTimeout>
  onStatus?: (status: Connection) => void

  connect() {
    this.source?.close()
    // The native sensor bridge is served only by the local launcher.
    if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
      this.setStatus('unavailable')
      return
    }
    this.setStatus('connecting')
    this.source = new EventSource('/api/motion/events')
    this.timeout = setTimeout(() => { if (!this.isLive) this.setStatus('unavailable') }, 1800)
    this.source.onmessage = event => {
      try {
        const packet = JSON.parse(event.data)
        if (packet.type !== 'motion' || !Number.isFinite(packet.roll) || !Number.isFinite(packet.pitch)) return
        if (packet.connected) {
          this.orientation = { roll: packet.roll, pitch: packet.pitch, receivedAt: performance.now() }
          this.setStatus('connected')
        } else this.setStatus('unavailable')
      } catch { /* Only a complete, finite orientation can steer. */ }
    }
    this.source.onerror = () => this.setStatus('unavailable')
  }

  get isLive() { return performance.now() - this.orientation.receivedAt < 600 }

  private setStatus(status: Connection) {
    if (status !== this.status) { this.status = status; this.onStatus?.(status) }
  }

  close() { clearTimeout(this.timeout); this.source?.close() }
}
