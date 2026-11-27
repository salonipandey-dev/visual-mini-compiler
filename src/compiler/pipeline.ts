import type { Program } from './ast';
import { hasErrors, type Diagnostic, type DiagnosticPhase, type PhaseId } from './diagnostics';
import { tokenize } from './lexer';
import { parse } from './parser';
import { analyze, type SymbolTable } from './semantic';
import { generate } from './codegen';
import type { IntermediateProgram } from './ir';
import type { Token } from './token';

export type PhaseStatus = 'success' | 'error' | 'skipped' | 'not-built';

export interface PhaseResult<Output> {
  readonly status: PhaseStatus;
  readonly output: Output | null;
  readonly diagnostics: readonly Diagnostic[];
  readonly note?: string;
}

export interface CompileResult {
  readonly source: string;
  readonly failedPhase: DiagnosticPhase | null;
  readonly phases: {
    readonly lexical: PhaseResult<readonly Token[]>;
    readonly syntax: PhaseResult<Program>;
    readonly semantic: PhaseResult<SymbolTable>;
    /** Present only when every earlier phase succeeded: a failed compile has no instructions. */
    readonly intermediate: PhaseResult<IntermediateProgram>;
  };
  readonly diagnostics: readonly Diagnostic[];
}

export const PHASES: ReadonlyArray<{ id: PhaseId; title: string; output: string }> = [
  { id: 'lexical', title: 'Lexical analysis', output: 'Tokens' },
  { id: 'syntax', title: 'Syntax analysis', output: 'Abstract syntax tree' },
  { id: 'semantic', title: 'Semantic analysis', output: 'Symbol table & checks' },
  { id: 'intermediate', title: 'Intermediate code', output: 'Three-address instructions' },
];

export function compile(source: string): CompileResult {
  const lex = tokenize(source);
  const lexFailed = hasErrors(lex.diagnostics);
  const lexical: PhaseResult<readonly Token[]> = {
    status: lexFailed ? 'error' : 'success',
    output: lex.tokens,
    diagnostics: lex.diagnostics,
  };

  let failedPhase: DiagnosticPhase | null = lexFailed ? lex.diagnostics[0].phase : null;
  let syntax: PhaseResult<Program>;
  if (lexFailed) {
    syntax = {
      status: 'skipped', output: null, diagnostics: [],
      note: 'Skipped because input validation or lexical analysis failed.',
    };
  } else {
    const parsed = parse(lex.tokens);
    const failed = hasErrors(parsed.diagnostics);
    syntax = { status: failed ? 'error' : 'success', output: parsed.ast, diagnostics: parsed.diagnostics };
    if (failed) failedPhase = 'syntax';
  }

  // Semantic analysis needs a complete AST, so it runs only if every earlier phase passed.
  let semantic: PhaseResult<SymbolTable>;
  if (failedPhase || !syntax.output) {
    semantic = {
      status: 'skipped', output: null, diagnostics: [],
      note: 'Skipped because an earlier phase reported an error.',
    };
  } else {
    const checked = analyze(syntax.output);
    const failed = hasErrors(checked.diagnostics);
    // On failure the table is partial (complete = false): it is kept so the UI can show it.
    semantic = { status: failed ? 'error' : 'success', output: checked.symbolTable, diagnostics: checked.diagnostics };
    if (failed) failedPhase = 'semantic';
  }

  // Code generation needs a validated AST: it runs only after lexical, syntax, and semantic success.
  // It does not execute anything; the instructions are for the future runner.
  let intermediate: PhaseResult<IntermediateProgram>;
  if (failedPhase || !syntax.output) {
    intermediate = {
      status: 'skipped', output: null, diagnostics: [],
      note: 'Skipped because an earlier phase reported an error, so no instructions were generated.',
    };
  } else {
    intermediate = { status: 'success', output: generate(syntax.output), diagnostics: [] };
  }

  return {
    source: lex.source, failedPhase, phases: { lexical, syntax, semantic, intermediate },
    diagnostics: [...lex.diagnostics, ...syntax.diagnostics, ...semantic.diagnostics],
  };
}
