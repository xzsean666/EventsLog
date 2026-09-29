import { ExecutionError } from '../protocol/types';

export type ErrorCallback = (error: ExecutionError, sourceInfo?: { file?: string; line?: number; col?: number }) => void;

export class GlobalErrorInterceptor {
  private originalOnError: typeof window.onerror = null;
  private isInstalled = false;
  private readonly callback: ErrorCallback;
  private errorHandler: ((event: ErrorEvent) => void) | null = null;
  private rejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

  constructor(callback: ErrorCallback) {
    this.callback = callback;
  }

  install(): void {
    if (this.isInstalled || typeof window === 'undefined') {
      return;
    }

    this.errorHandler = (event: ErrorEvent) => {
      const err = event.error || event.message;
      let executionError: ExecutionError;

      if (err instanceof Error) {
        executionError = {
          type_name: err.name || 'WindowError',
          message: err.message || event.message || 'Uncaught window error',
          stack_trace: err.stack,
        };
      } else {
        executionError = {
          type_name: 'WindowError',
          message: typeof err === 'string' ? err : 'Unknown uncaught error',
        };
      }

      this.callback(executionError, {
        file: event.filename,
        line: event.lineno,
        col: event.colno,
      });
    };

    this.rejectionHandler = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      let executionError: ExecutionError;

      if (reason instanceof Error) {
        executionError = {
          type_name: reason.name || 'UnhandledPromiseRejection',
          message: reason.message || 'Unhandled Promise Rejection',
          stack_trace: reason.stack,
        };
      } else {
        let message = 'Unhandled Promise Rejection';
        if (typeof reason === 'string') {
          message = reason;
        } else {
          try {
            message = JSON.stringify(reason) || 'Unhandled Promise Rejection';
          } catch {
            message = String(reason) || 'Unhandled Promise Rejection';
          }
        }
        executionError = {
          type_name: 'UnhandledPromiseRejection',
          message,
        };
      }

      this.callback(executionError);
    };

    window.addEventListener('error', this.errorHandler);
    window.addEventListener('unhandledrejection', this.rejectionHandler);
    this.isInstalled = true;
  }

  uninstall(): void {
    if (!this.isInstalled || typeof window === 'undefined') {
      return;
    }

    if (this.errorHandler) {
      window.removeEventListener('error', this.errorHandler);
      this.errorHandler = null;
    }
    if (this.rejectionHandler) {
      window.removeEventListener('unhandledrejection', this.rejectionHandler);
      this.rejectionHandler = null;
    }
    this.isInstalled = false;
  }
}
