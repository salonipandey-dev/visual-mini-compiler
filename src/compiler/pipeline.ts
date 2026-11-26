/**
 * pipeline.ts — runs the phases in order and packages every result.
 *
 *   source ──► lexical ──► syntax ──► semantic ──► ...
 *
 * Rule: a phase only runs if every phase before it finished without errors.
 * Phases after a failure are marked "skipped", but the output of the phases
 * that DID run (for example the tokens) is kept so the UI can still show it.
 *
 * Checkpoint 1: only the lexical phase is built. Syntax and semantic analysis
 * report "not-built" until checkpoints 2 and 3 replace these placeholders.
 */

import { hasErrors, type Diagnostic, type PhaseId } from './diagnostics';
import { tokenize } from './lexer';
import type { Token } from './token';

export type PhaseStatus = 'success' | 'error' | 'skipped' | 'not-built';

export interface PhaseResult<Output> {
  status: PhaseStatus;
  /** The phase's real output; null if it did not run. */
  output: Output | null;
  diagnostics: Diagnostic[];
  /** Short explanation for "skipped" and "not-built" phases. */
  note?: string;
}

export interface CompileResult {
  /** The exact source text these results were produced from. */
  source: string;
  /** The first phase that reported an error, or null if none did. */
  failedPhase: PhaseId | null;
  phases: {
    lexical: PhaseResult<Token[]>;
    syntax: PhaseResult<null>;
    semantic: PhaseResult<null>;
  };
  /** Every diagnostic from every phase that ran, in pipeline order. */
  diagnostics: Diagnostic[];
}

/** Display names, in pipeline order. The UI builds its stepper from this list. */
export const PHASES: ReadonlyArray<{ id: PhaseId; title: string; output: string }> = [
  { id: 'lexical', title: 'Lexical analysis', output: 'Tokens' },
  { id: 'syntax', title: 'Syntax analysis', output: 'Parse tree & AST' },
  { id: 'semantic', title: 'Semantic analysis', output: 'Symbol table & checks' },
];

const PHASE_TITLE = Object.fromEntries(PHASES.map((p) => [p.id, p.title])) as Record<PhaseId, string>;

export function compile(source: string): CompileResult {
  // ---- Phase 1: lexical analysis ----
  const lex = tokenize(source);
  const lexFailed = hasErrors(lex.diagnostics);
  const lexical: PhaseResult<Token[]> = {
    status: lexFailed ? 'error' : 'success',
    output: lex.tokens, // kept even on error, so the UI can show the ERROR tokens
    diagnostics: lex.diagnostics,
  };

  const failedPhase: PhaseId | null = lexFailed ? 'lexical' : null;

  // ---- Phases 2 and 3: placeholders until their checkpoints ----
  const placeholder = (checkpoint: number): PhaseResult<null> =>
    failedPhase
      ? {
          status: 'skipped',
          output: null,
          diagnostics: [],
          note: `Skipped because ${PHASE_TITLE[failedPhase].toLowerCase()} reported errors.`,
        }
      : {
          status: 'not-built',
          output: null,
          diagnostics: [],
          note: `This phase is implemented in checkpoint ${checkpoint}.`,
        };

  return {
    source,
    failedPhase,
    phases: {
      lexical,
      syntax: placeholder(2),
      semantic: placeholder(3),
    },
    diagnostics: [...lex.diagnostics],
  };
}
