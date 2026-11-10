/**
 * Synthesised library ambience: low room tone, soft footsteps on carpet, page turns, a door
 * creak and a clock chime. Sound is ON by default, but browsers block audio until a user
 * gesture, so the AudioContext is only created on the visitor's first pointerdown or keydown
 * anywhere; the room tone then fades in over ~2s. Turning sound off is remembered per viewer.
 * All sounds are generated with Web Audio: there are no audio files to download.
 */
const STORAGE_KEY = 'museum-sound'

function storedPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

class Ambience {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private enabled = storedPreference()
  private unlocked = false

  constructor() {
    // Unlock on the first gesture anywhere (capture phase, so it runs before click handlers).
    const unlock = () => {
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('keydown', unlock, true)
      this.unlocked = true
      if (this.enabled) this.apply(2)
    }
    window.addEventListener('pointerdown', unlock, true)
    window.addEventListener('keydown', unlock, true)
  }

  /** Whether sound is on (armed, even if the browser hasn't let it play yet). */
  get on(): boolean {
    return this.enabled
  }

  /** Called from the sound toggle's click (a user gesture). */
  setEnabled(on: boolean): void {
    this.enabled = on
    try {
      localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
    } catch {
      // Storage blocked: the choice just won't persist.
    }
    if (this.unlocked) this.apply(0.6)
  }

  /** Fade the master level to match the setting over roughly `seconds`. */
  private apply(seconds: number): void {
    if (this.enabled && !this.ctx) this.start()
    if (!this.ctx || !this.master) return
    if (this.enabled) void this.ctx.resume()
    const now = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setValueAtTime(this.master.gain.value, now)
    this.master.gain.setTargetAtTime(this.enabled ? 1 : 0, now, seconds / 3)
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
      env.gain.linearRampToValueAtTime(0.13, t + 0.012)
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
    env.gain.linearRampToValueAtTime(0.06, t + 0.05)
    env.gain.linearRampToValueAtTime(0.035, t + 0.18)
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.42)
    src.connect(band).connect(env).connect(this.master!)
    src.start(t, Math.random(), 0.5)
  }

  /** A heavy wooden door: a latch click, then a low creak as it swings. */
  doorOpen(): void {
    if (!this.ready()) return
    const ctx = this.ctx!
    const t = ctx.currentTime + 0.02
    // Latch: a short, bright tick.
    const click = this.noiseSource()
    const hp = ctx.createBiquadFilter()
    hp.type = 'bandpass'
    hp.frequency.value = 2200
    hp.Q.value = 3
    const clickEnv = ctx.createGain()
    clickEnv.gain.setValueAtTime(0, t)
    clickEnv.gain.linearRampToValueAtTime(0.14, t + 0.004)
    clickEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.06)
    click.connect(hp).connect(clickEnv).connect(this.master!)
    click.start(t, Math.random(), 0.08)
    // Creak: a rough, slowly wavering low tone.
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(95, t + 0.08)
    osc.frequency.linearRampToValueAtTime(140, t + 0.5)
    osc.frequency.linearRampToValueAtTime(110, t + 0.95)
    const wobble = ctx.createOscillator()
    wobble.frequency.value = 23
    const wobbleGain = ctx.createGain()
    wobbleGain.gain.value = 12
    wobble.connect(wobbleGain).connect(osc.frequency)
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 650
    band.Q.value = 2.5
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, t + 0.08)
    env.gain.linearRampToValueAtTime(0.022, t + 0.25)
    env.gain.linearRampToValueAtTime(0.013, t + 0.7)
    env.gain.exponentialRampToValueAtTime(0.0005, t + 1.05)
    osc.connect(band).connect(env).connect(this.master!)
    osc.start(t + 0.08)
    wobble.start(t + 0.08)
    osc.stop(t + 1.1)
    wobble.stop(t + 1.1)
  }

  /** A soft two-note clock chime. */
  chime(): void {
    if (!this.ready()) return
    const ctx = this.ctx!
    const t0 = ctx.currentTime + 0.02
    for (const [freq, at] of [[659.25, 0], [493.88, 0.45]] as const) {
      for (const [mult, level] of [[1, 0.06], [2.76, 0.017], [5.4, 0.007]] as const) {
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = freq * mult
        const env = ctx.createGain()
        const t = t0 + at
        env.gain.setValueAtTime(0, t)
        env.gain.linearRampToValueAtTime(level, t + 0.01)
        env.gain.exponentialRampToValueAtTime(0.0005, t + 2.2)
        osc.connect(env).connect(this.master!)
        osc.start(t)
        osc.stop(t + 2.3)
      }
    }
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
    toneGain.gain.value = 0.035 // low room tone
    tone.connect(low).connect(toneGain).connect(this.master)
    tone.start()

    // A faint, slow swell so the tone isn't static.
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.07
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.012
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
