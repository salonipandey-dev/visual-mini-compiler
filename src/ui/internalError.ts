/**
 * The workbench's single place for unexpected internal defects (bugs in the
 * compiler, runner, or UI — never errors in the user's program).
 *
 * Details, including stack traces, go to the browser console for developers.
 * The interface only ever shows a short, non-technical message.
 */
export function reportInternalError(where: string, error: unknown): void {
  console.error(`[Visual Mini Compiler] Internal error in ${where}:`, error);
}
