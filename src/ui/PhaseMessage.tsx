import type { ReactNode } from 'react';

/** The panel shown when a phase has no output to display: not run, skipped, or not built yet. */
export function PhaseMessage({
  tone,
  title,
  children,
}: {
  tone: 'idle' | 'skipped' | 'pending';
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={`phase-message message-${tone}`}>
      <h3>{title}</h3>
      {children}
    </div>
  );
}
