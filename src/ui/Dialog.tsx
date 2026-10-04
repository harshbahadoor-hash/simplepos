import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { sound } from '../sound/sound-manager';

export function Dialog({ title, children, close, className }: { title: string; children: ReactNode; close: () => void; className?: string }) {
  const element = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const previous = document.activeElement;
    const panel = element.current;
    const controls = () => Array.from(element.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]') ?? []);
    controls()[0]?.focus();
    function trap(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); sound.playTap(); close(); }
      if (event.key !== 'Tab') return;
      const first = controls()[0], last = controls().at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      // Preserve deliberate focus changes (for example, a committed preset).
      if (previous instanceof HTMLElement && (document.activeElement === document.body || panel?.contains(document.activeElement))) previous.focus({ preventScroll: true });
    };
  }, [close]);
  return <div className="overlay"><section ref={element} className={className} role="dialog" aria-modal="true" aria-label={title}><h2>{title}</h2>{children}</section></div>;
}
