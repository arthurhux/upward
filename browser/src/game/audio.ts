export class GameAudio {
  private context?: AudioContext
  enabled = false

  unlock() {
    if (!this.enabled) return
    this.context ??= new AudioContext()
    void this.context.resume()
  }

  landing(power: number, count: number) {
    const context = this.context
    if (!this.enabled || !context || context.state !== 'running') return
    const pentatonic = [261.63, 293.66, 329.63, 392, 440, 523.25]
    const frequency = pentatonic[count % pentatonic.length] * (power > 0.65 ? 2 : 1)
    for (const harmonic of [1, 2.01]) {
      const oscillator = context.createOscillator(), gain = context.createGain()
      oscillator.type = 'sine'; oscillator.frequency.value = frequency * harmonic
      const time = context.currentTime
      gain.gain.setValueAtTime(0, time)
      gain.gain.linearRampToValueAtTime(0.045 / harmonic, time + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.45)
      oscillator.connect(gain); gain.connect(context.destination)
      oscillator.start(time); oscillator.stop(time + 0.5)
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
    }
  }

  close() { void this.context?.close(); this.context = undefined }
}
