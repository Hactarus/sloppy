import { storage } from '../api/storage'

let ctx: AudioContext | null = null
function beep(freq: number, ms: number, type: OscillatorType = 'sine', gain = 0.08) {
  if (storage.getMute()) return
  try {
    ctx ??= new AudioContext()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.value = freq
    g.gain.value = gain
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + ms / 1000)
  } catch { /* audio unavailable */ }
}
function vibrate(p: number | number[]) {
  try { navigator.vibrate?.(p) } catch { /* ignore */ }
}

export const feedback = {
  tick() { vibrate(8); beep(880, 25, 'square', 0.03) },
  remove() { vibrate(8); beep(520, 25, 'square', 0.03) },
  armed() { vibrate(20) },
  success() { vibrate([30, 40, 30]); beep(880, 90); setTimeout(() => beep(1320, 140), 100) },
  failure() { vibrate([120, 60, 120]); beep(220, 300, 'sawtooth', 0.1) },
}
