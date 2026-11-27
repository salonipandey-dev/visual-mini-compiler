// Public compiler API. The core never imports React or touches the DOM.
export { compile, PHASES } from './pipeline';
export type { CompileResult, PhaseResult, PhaseStatus } from './pipeline';
export { tokenize } from './lexer';
export type { LexResult } from './lexer';
export { parse } from './parser';
export type { ParseResult } from './parser';
export { analyze } from './semantic';
export type { SemanticResult, SymbolEntry, SymbolTable } from './semantic';
export { generate } from './codegen';
export { formatInstruction, formatOperand, instructionParts } from './ir-format';
export type { InstructionPart } from './ir-format';
export type {
  Instruction, Opcode, BinaryOpcode, IntermediateProgram, Operand,
  IntegerOperand, VariableOperand, TemporaryOperand,
  CopyInstruction, BinaryInstruction, NegInstruction, PrintInstruction,
} from './ir';
export { normalizeSource } from './source';
export type { Token, TokenType } from './token';
export type {
  Program, Statement, Expression, AstNode, SourceSpan,
  LetDeclaration, PrintStatement, IntegerLiteral, Identifier,
  UnaryExpression, BinaryExpression, GroupingExpression,
} from './ast';
export { formatDiagnostic, hasErrors } from './diagnostics';
export type { CompilePhase, Diagnostic, DiagnosticCode, DiagnosticPhase, PhaseId, Severity } from './diagnostics';
