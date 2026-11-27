/**
 * ErrorBoundary — catches unexpected errors while React renders the workbench,
 * so a defect shows a calm message instead of a blank page. Errors thrown inside
 * event handlers (like Run) are not seen by React boundaries; those handlers
 * catch them and call reportInternalError themselves.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportInternalError } from './internalError';

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    reportInternalError('the workbench display', { error, componentStack: info.componentStack });
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="internal-error" role="alert">
        <h1>Visual Mini Compiler</h1>
        <p>
          The workbench hit an internal error and stopped displaying. This is a problem in the
          workbench, not in your program. Technical details were written to the browser console.
        </p>
        <button type="button" className="btn-compile" onClick={() => window.location.reload()}>
          Reload the workbench
        </button>
      </div>
    );
  }
}
