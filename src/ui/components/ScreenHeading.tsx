import { useEffect, useRef, type ReactNode } from 'react';

/** The screen's single h1. Takes focus when the screen appears, for screen readers. */
export function ScreenHeading({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1}>
      {children}
    </h1>
  );
}
