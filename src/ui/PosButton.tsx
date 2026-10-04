import type { ButtonHTMLAttributes } from 'react';
import { sound, type Sound } from '../sound/sound-manager';
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Sound };
export function PosButton({ tone = 'tap', onClick, children, ...props }: Props) {
  return <button {...props} onClick={event => { sound.play(tone); onClick?.(event); }}>{children}</button>;
}
