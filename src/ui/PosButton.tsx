import { useRef, type ButtonHTMLAttributes } from 'react';
import { sound, type Sound } from '../sound/sound-manager';
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Sound };
export function PosButton({ tone = 'tap', onClick, children, onPointerDown, onPointerMove, onPointerCancel, onPointerUp, onKeyDown, ...props }: Props) {
  const press = useRef<{ id: number; x: number; y: number; canceled: boolean } | null>(null);
  return <button {...props}
    onPointerDown={event => {
      press.current = { id: event.pointerId, x: event.clientX, y: event.clientY, canceled: !event.isPrimary || event.button !== 0 };
      onPointerDown?.(event);
    }}
    onPointerMove={event => {
      const start = press.current;
      if (start && start.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) start.canceled = true;
      onPointerMove?.(event);
    }}
    onPointerCancel={event => { if (press.current) press.current.canceled = true; onPointerCancel?.(event); }}
    onPointerUp={event => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (press.current && (event.pointerId !== press.current.id || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) press.current.canceled = true;
      onPointerUp?.(event);
    }}
    onKeyDown={event => { if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault(); onKeyDown?.(event); }}
    onClick={event => {
      if (event.detail > 0 && (!press.current || press.current.canceled)) return;
      press.current = null;
      sound.play(tone); onClick?.(event);
    }}>{children}</button>;
}
