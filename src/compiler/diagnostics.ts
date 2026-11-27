/** Shared diagnostics for the compiler core and workbench. */
export type PhaseId = 'lexical' | 'syntax' | 'semantic';
export type DiagnosticPhase = PhaseId | 'input';
export type Severity = 'error' | 'warning';

export interface Diagnostic {
  readonly phase: DiagnosticPhase;
  readonly severity: Severity;
  readonly message: string;
  readonly line: number;
  readonly column: number;
  /** UTF-16 offset and length for browser text selection. */
  readonly offset: number;
  readonly length: number;
  readonly expected?: string;
  readonly found?: string;
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}

export function formatDiagnostic(d: Diagnostic): string {
  let text = d.phase + ' ' + d.severity + ' at ' + d.line + ':' + d.column + ': ' + d.message;
  if (d.expected) text += ' (expected ' + d.expected + ')';
  return text;
}
