import { useRef, type ButtonHTMLAttributes, type MouseEvent } from 'react';
import { sound, type Sound } from '../sound/sound-manager';
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Sound };
let trailingTap: { x: number; y: number; until: number } | null = null;
function clearTrailingTap() {
  trailingTap = null;
  document.removeEventListener('pointerdown', shieldTrailingTap, true);
  document.removeEventListener('click', shieldTrailingTap, true);
}
function shieldTrailingTap(event: globalThis.MouseEvent) {
  if (event.type === 'click' && event.detail === 0) { clearTrailingTap(); return; }
  if (trailingTap && Date.now() < trailingTap.until && Math.hypot(event.clientX - trailingTap.x, event.clientY - trailingTap.y) <= 10) {
    event.preventDefault(); event.stopPropagation();
  } else clearTrailingTap();
}
/** Changing an overlay must not retarget a second tap to its replacement control. */
export function preventTapThrough(event: MouseEvent<HTMLButtonElement>) {
  if (event.detail === 0) return;
  trailingTap = { x: event.clientX, y: event.clientY, until: Date.now() + 500 };
  document.addEventListener('pointerdown', shieldTrailingTap, true);
  document.addEventListener('click', shieldTrailingTap, true);
}
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
