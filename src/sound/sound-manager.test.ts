import { expect, it } from 'vitest';
import { SoundManager } from './sound-manager';
it('remains usable when audio and preference storage are unavailable', () => {
  const sound = new SoundManager();
  expect(sound.isEnabled()).toBe(true);
  expect(() => sound.playTap()).not.toThrow();
  sound.setEnabled(false);
  expect(sound.isEnabled()).toBe(false);
  expect(() => sound.playError()).not.toThrow();
});
