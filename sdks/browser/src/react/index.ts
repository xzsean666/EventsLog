import React, { Component, ReactNode, useCallback, useMemo, DependencyList } from 'react';
import { getClient, startSpan, captureError } from '../index';
import { SpanContext } from '../tracing/context';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, componentStack: string) => void;
  componentName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary component that captures component crashes and reports them to EventsLog.
 */
export class EventsLogErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const componentName = this.props.componentName || 'ReactErrorBoundary';
    const componentStack = errorInfo.componentStack || '';

    // Capture to EventsLog platform
    captureError(error, {
      'react.component': componentName,
      'react.component_stack': componentStack,
    });

    if (this.props.onError) {
      this.props.onError(error, componentStack);
    }
  }

  resetError = (): void => {
    this.setState({ hasError: false, error: null });
  };

  override render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error, this.resetError);
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return React.createElement(
        'div',
        {
          style: {
            padding: 16,
            border: '1px solid #f87171',
            borderRadius: 4,
            background: '#fef2f2',
            color: '#991b1b',
          },
        },
        React.createElement('h3', null, 'Rendering Error'),
        React.createElement('p', null, this.state.error.message)
      );
    }

    return this.props.children;
  }
}

/**
 * Custom hook providing tracing helpers in React function components.
 */
export function useTrace() {
  const client = getClient();

  const currentSpan = useMemo<SpanContext | undefined>(() => {
    return client?.contextManager.getCurrentSpan();
  }, [client]);

  return {
    client,
    currentSpan,
    startSpan: useCallback(
      <T>(name: string, fn: () => T, attributes?: Record<string, unknown>) => {
        return startSpan(name, fn, attributes);
      },
      []
    ),
    captureError: useCallback((error: unknown, attributes?: Record<string, unknown>) => {
      captureError(error, attributes);
    }, []),
  };
}

/**
 * Wraps an event handler or callback function in a traced span.
 */
export function useTracedCallback<T extends (...args: unknown[]) => unknown>(
  name: string,
  callback: T,
  deps: DependencyList = []
): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(
    ((...args: unknown[]) => {
      return startSpan(name, () => callback(...args), {
        'callback.name': name,
      });
    }) as T,
    deps
  );
}

/**
 * Higher-Order Component (HOC) to trace component render cycles.
 */
export function withTracing<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName?: string
): React.FC<P> {
  const name = componentName || WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const TracedComponent: React.FC<P> = (props) => {
    return startSpan(`react.${name}.render`, () => {
      return React.createElement(WrappedComponent, props);
    });
  };

  TracedComponent.displayName = `WithTracing(${name})`;
  return TracedComponent;
}
