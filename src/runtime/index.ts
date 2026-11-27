// Public runtime API. It depends on the compiler's types; the compiler never imports the runtime.
import type { CompileResult, IntermediateProgram } from '../compiler';

export { execute, INTEGER_LIMIT, RuntimeInternalError } from './runner';
export type { ExecutionResult } from './runner';

/**
 * The instructions of a compilation that may be run, or null.
 * Only a compilation where every phase succeeded, including code generation,
 * is runnable. An empty instruction list IS runnable: it is not "missing".
 */
export function runnableProgram(result: CompileResult): IntermediateProgram | null {
  const intermediate = result.phases.intermediate;
  if (result.failedPhase !== null || intermediate.status !== 'success') return null;
  return intermediate.output;
}
