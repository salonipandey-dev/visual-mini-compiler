/** Shared diagnostics for the compiler core and workbench. */
export type PhaseId = 'lexical' | 'syntax' | 'semantic' | 'intermediate';
/** Where a compilation can fail. */
export type CompilePhase = PhaseId | 'input';
/** 'runtime' diagnostics come from executing instructions, never from compiling. */
export type DiagnosticPhase = CompilePhase | 'runtime';
export type Severity = 'error' | 'warning';
/** Stable identifiers for diagnostics that tests and tools may need to tell apart. */
export type DiagnosticCode = 'undeclared-variable' | 'duplicate-declaration' | 'integer-limit-exceeded';

export interface Diagnostic {
  readonly phase: DiagnosticPhase;
  readonly severity: Severity;
  readonly code?: DiagnosticCode;
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
