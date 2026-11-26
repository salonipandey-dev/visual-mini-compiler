// Public surface of the compiler core. The UI imports from here only.
// Nothing in src/compiler/ may import React or touch the DOM.
export { compile, PHASES } from './pipeline';
export type { CompileResult, PhaseResult, PhaseStatus } from './pipeline';
export { tokenize } from './lexer';
export type { LexResult } from './lexer';
export type { Token, TokenType } from './token';
export { formatDiagnostic, hasErrors } from './diagnostics';
export type { Diagnostic, PhaseId, Severity } from './diagnostics';
