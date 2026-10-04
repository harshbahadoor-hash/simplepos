export type Sound = 'tap' | 'positive' | 'delete' | 'error';
export class SoundManager {
  private enabled = true;
  private context?: AudioContext;
  private buffers = new Map<Sound, AudioBuffer>();
  private voice?: AudioBufferSourceNode;
  constructor() {
    try { this.enabled = localStorage.getItem('simplePosButtonSounds') !== 'false'; } catch { /* Preferences are optional. */ }
    this.prepare();
  }
  private prepare() {
    try {
      if (this.context || typeof AudioContext === 'undefined') return;
      this.context = new AudioContext({ latencyHint: 'interactive' });
      for (const kind of ['tap', 'positive', 'delete', 'error'] as const) {
        const duration = kind === 'error' ? 0.065 : 0.024;
        const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * duration), this.context.sampleRate);
        const data = buffer.getChannelData(0);
        const frequency = { tap: 1600, positive: 2100, delete: 700, error: 350 }[kind];
        for (let i = 0; i < data.length; i++) {
          const t = i / this.context.sampleRate;
          data[i] = Math.sin(t * frequency * Math.PI * 2) * Math.exp(-t * 240) * 0.15;
        }
        this.buffers.set(kind, buffer);
      }
    } catch { this.context = undefined; }
  }
  isEnabled() { return this.enabled; }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    try { localStorage.setItem('simplePosButtonSounds', String(enabled)); } catch { /* Use in-memory preference. */ }
  }
  play(kind: Sound = 'tap') {
    if (!this.enabled) return;
    try {
      this.prepare();
      const context = this.context;
      if (!context) return;
      if (context.state === 'suspended') void context.resume().catch(() => {});
      this.voice?.stop();
      const voice = context.createBufferSource();
      voice.buffer = this.buffers.get(kind) ?? null;
      voice.connect(context.destination);
      voice.start();
      this.voice = voice;
    } catch { /* Audio must never block a sale. */ }
  }
  playTap() { this.play('tap'); }
  playPositive() { this.play('positive'); }
  playDelete() { this.play('delete'); }
  playError() { this.play('error'); }
}
export const sound = new SoundManager();
