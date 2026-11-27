import type { Program } from './ast';
import { hasErrors, type Diagnostic, type DiagnosticPhase, type PhaseId } from './diagnostics';
import { tokenize } from './lexer';
import { parse } from './parser';
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
    readonly semantic: PhaseResult<null>;
  };
  readonly diagnostics: readonly Diagnostic[];
}

export const PHASES: ReadonlyArray<{ id: PhaseId; title: string; output: string }> = [
  { id: 'lexical', title: 'Lexical analysis', output: 'Tokens' },
  { id: 'syntax', title: 'Syntax analysis', output: 'Abstract syntax tree' },
  { id: 'semantic', title: 'Semantic analysis', output: 'Symbol table & checks' },
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

  const semantic: PhaseResult<null> = failedPhase
    ? {
        status: 'skipped', output: null, diagnostics: [],
        note: 'Skipped because an earlier phase reported an error.',
      }
    : {
        status: 'not-built', output: null, diagnostics: [],
        note: 'Semantic checks and the symbol table are implemented in checkpoint 3.',
      };

  return {
    source: lex.source, failedPhase, phases: { lexical, syntax, semantic },
    diagnostics: [...lex.diagnostics, ...syntax.diagnostics],
  };
}
