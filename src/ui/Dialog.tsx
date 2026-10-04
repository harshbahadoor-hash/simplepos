import { useEffect, useRef, type ReactNode } from 'react';
import { sound } from '../sound/sound-manager';

export function Dialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const element = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const controls = () => Array.from(element.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]') ?? []);
    controls()[0]?.focus();
    function trap(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); sound.playTap(); close(); }
      if (event.key !== 'Tab') return;
      const first = controls()[0], last = controls().at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); if (previous instanceof HTMLElement) previous.focus(); };
  }, [close]);
  return <div className="overlay"><section ref={element} role="dialog" aria-modal="true" aria-label={title}><h2>{title}</h2>{children}</section></div>;
}
