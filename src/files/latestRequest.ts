/**
 * latestRequest.ts — lets only the most recent asynchronous file read win.
 *
 * Each Open takes a ticket. Starting another Open, or applying any other
 * replacement (such as Load Example), makes every older ticket stale, so a
 * slow read that finishes late is ignored instead of overwriting newer work.
 */
export class LatestRequest {
  private current = 0;

  /** Start a new request; every earlier ticket becomes stale. */
  begin(): number {
    this.current += 1;
    return this.current;
  }

  /** Make every outstanding ticket stale without starting a new request. */
  invalidate(): void {
    this.current += 1;
  }

  isCurrent(ticket: number): boolean {
    return ticket === this.current;
  }
}
