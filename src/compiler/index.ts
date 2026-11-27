// Public compiler API. The core never imports React or touches the DOM.
export { compile, PHASES } from './pipeline';
export type { CompileResult, PhaseResult, PhaseStatus } from './pipeline';
export { tokenize } from './lexer';
export type { LexResult } from './lexer';
export { parse } from './parser';
export type { ParseResult } from './parser';
export { normalizeSource } from './source';
export type { Token, TokenType } from './token';
export type {
  Program, Statement, Expression, AstNode, SourceSpan,
  LetDeclaration, PrintStatement, IntegerLiteral, Identifier,
  UnaryExpression, BinaryExpression, GroupingExpression,
} from './ast';
export { formatDiagnostic, hasErrors } from './diagnostics';
export type { Diagnostic, DiagnosticPhase, PhaseId, Severity } from './diagnostics';
