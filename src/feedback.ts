import type { GameEvent } from './game';

/** Swap this interface for a native implementation when packaging for mobile. */
export interface Haptics { impact(strength: 'light' | 'medium' | 'heavy'): void }
export class BrowserHaptics implements Haptics {
  impact(strength: 'light' | 'medium' | 'heavy') {
    navigator.vibrate?.(strength === 'heavy' ? [16, 25, 20] : strength === 'medium' ? 14 : 6);
  }
}

export class Feedback {
  enabled = true;
  private context?: AudioContext;
  constructor(private haptics: Haptics = new BrowserHaptics()) {}
  unlock() {
    if (!this.enabled) return;
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => {}); } catch { /* Audio is optional. */ }
  }
  private tone(frequency: number, delay: number, length: number, volume: number, end = frequency) {
    const context = this.context;
    if (!this.enabled || !context || context.state !== 'running') return;
    const oscillator = context.createOscillator(), gain = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(end, start + length);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(start); oscillator.stop(start + length + 0.01);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  handle(event: GameEvent) {
    if (event.type === 'launch') {
      this.tone(180, 0, 0.14, 0.045, 420); this.haptics.impact('light');
    } else if (event.type === 'merge') {
      const note = 261.63 * 2 ** ((event.value - 2 + Math.min(event.depth, 4)) / 12);
      this.tone(note, 0, 0.35, 0.085);
      this.tone(note * 1.5, 0.045, 0.4, 0.04);
      if (event.depth > 1) this.tone(note * 2, 0.09, 0.45, 0.055);
      this.haptics.impact(event.depth > 1 ? 'heavy' : 'medium');
    } else if (event.type === 'hold') {
      this.tone(330, 0, 0.12, 0.035, 440); this.haptics.impact('light');
    } else if (event.type === 'over') {
      this.tone(180, 0, 0.6, 0.07, 65);
    }
  }
}
