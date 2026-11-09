/**
 * Synthesised library ambience: low room tone, soft footsteps on carpet, and a page turn.
 * Nothing is created or played until the visitor turns sound on (a click), and it's muted by
 * default. All sounds are generated with Web Audio, so there are no audio files to download.
 */
class Ambience {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private enabled = false

  get on(): boolean {
    return this.enabled
  }

  /** Must be called from a user gesture (e.g. the sound toggle's click). */
  setEnabled(on: boolean): void {
    this.enabled = on
    if (on && !this.ctx) this.start()
    if (!this.ctx || !this.master) return
    if (on) void this.ctx.resume()
    const now = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setTargetAtTime(on ? 1 : 0, now, 0.25)
  }

  /** Footsteps spread over a walk of `seconds`. */
  steps(seconds: number, count = Math.max(3, Math.round(seconds * 2.4))): void {
    if (!this.ready()) return
    const ctx = this.ctx!
    const t0 = ctx.currentTime + 0.05
    for (let i = 0; i < count; i++) {
      const t = t0 + (i + 0.5) * (seconds / count) + (Math.random() - 0.5) * 0.04
      const src = this.noiseSource()
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 520 + Math.random() * 120 // muffled by the carpet
      const env = ctx.createGain()
      env.gain.setValueAtTime(0, t)
      env.gain.linearRampToValueAtTime(0.22, t + 0.012)
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.16)
      src.connect(filter).connect(env).connect(this.master!)
      src.start(t, Math.random(), 0.2)
    }
  }

  pageTurn(): void {
    if (!this.ready()) return
    const ctx = this.ctx!
    const t = ctx.currentTime + 0.02
    const src = this.noiseSource()
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.Q.value = 0.8
    band.frequency.setValueAtTime(1400, t)
    band.frequency.exponentialRampToValueAtTime(4200, t + 0.28)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(0.09, t + 0.05)
    env.gain.linearRampToValueAtTime(0.05, t + 0.18)
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.42)
    src.connect(band).connect(env).connect(this.master!)
    src.start(t, Math.random(), 0.5)
  }

  private ready(): boolean {
    return this.enabled && this.ctx !== null && this.ctx.state === 'running'
  }

  private start(): void {
    const ctx = new AudioContext()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(ctx.destination)

    // Brown noise (integrated white noise) for room tone and as a source for effects.
    const length = ctx.sampleRate * 4
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
      data[i] = last * 3.5
    }
    this.noise = buffer

    const tone = this.noiseSource()
    tone.loop = true
    const low = ctx.createBiquadFilter()
    low.type = 'lowpass'
    low.frequency.value = 260
    const toneGain = ctx.createGain()
    toneGain.gain.value = 0.06
    tone.connect(low).connect(toneGain).connect(this.master)
    tone.start()

    // A faint, slow swell so the tone isn't static.
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.07
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.02
    lfo.connect(lfoGain).connect(toneGain.gain)
    lfo.start()
  }

  private noiseSource(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource()
    src.buffer = this.noise
    return src
  }
}

export const sound = new Ambience()
