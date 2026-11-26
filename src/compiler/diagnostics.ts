/**
 * diagnostics.ts — ONE shared shape for every compiler message.
 *
 * Every phase (lexer, parser, semantic checker, ...) reports problems using
 * this same `Diagnostic` type. That lets the UI show all errors the same way
 * and lets tests check errors without caring which phase produced them.
 */

/** The compiler phases, in pipeline order. Later checkpoints add more. */
export type PhaseId = 'lexical' | 'syntax' | 'semantic';

export type Severity = 'error' | 'warning';

export interface Diagnostic {
  /** Which phase reported the problem. */
  phase: PhaseId;
  severity: Severity;
  /** Human-readable explanation, without the position (the UI adds that). */
  message: string;
  /** 1-based line where the problem starts. */
  line: number;
  /** 1-based column where the problem starts. */
  column: number;
  /** 0-based index into the source string (used to highlight the text). */
  offset: number;
  /** How many characters to highlight. */
  length: number;
  /** What the compiler expected to see, when it knows. */
  expected?: string;
  /** What it actually found. */
  found?: string;
}

/** True if at least one diagnostic is an error (warnings do not stop the pipeline). */
export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}

/**
 * One-line text form, handy for tests and the console, e.g.
 *   lexical error at 3:15: Unexpected character '@'
 */
export function formatDiagnostic(d: Diagnostic): string {
  let text = `${d.phase} ${d.severity} at ${d.line}:${d.column}: ${d.message}`;
  if (d.expected) text += ` (expected ${d.expected})`;
  return text;
}
