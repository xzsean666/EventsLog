import { BrowserContextManager } from '../tracing/context';
import { Event, createExecutionError } from '../protocol/types';
import { generateEventId } from '../tracing/context';

export type EventEmitCallback = (event: Event) => void;

export class FetchInterceptor {
  private originalFetch: typeof fetch | null = null;
  private isInstalled = false;
  private readonly contextManager: BrowserContextManager;
  private readonly emitCallback: EventEmitCallback;
  private readonly ingestionEndpoint: string;
  private readonly serviceName: string;
  private readonly environment: string;
  private readonly allowedTracingOrigins?: (string | RegExp)[];

  constructor(
    contextManager: BrowserContextManager,
    emitCallback: EventEmitCallback,
    options: {
      ingestionEndpoint: string;
      serviceName: string;
      environment: string;
      allowedTracingOrigins?: (string | RegExp)[];
    }
  ) {
    this.contextManager = contextManager;
    this.emitCallback = emitCallback;
    this.ingestionEndpoint = options.ingestionEndpoint;
    this.serviceName = options.serviceName;
    this.environment = options.environment;
    this.allowedTracingOrigins = options.allowedTracingOrigins;
  }

  private shouldPropagateTrace(urlString: string): boolean {
    if (!urlString) return false;
    if (this.ingestionEndpoint && urlString.includes(this.ingestionEndpoint)) {
      return false;
    }
    if (this.allowedTracingOrigins && this.allowedTracingOrigins.length > 0) {
      return this.allowedTracingOrigins.some((rule) => {
        if (typeof rule === 'string') {
          return urlString.includes(rule) || urlString.startsWith(rule);
        }
        if (rule instanceof RegExp) {
          return rule.test(urlString);
        }
        return false;
      });
    }
    // Default to same-origin only
    if (typeof window !== 'undefined' && window.location?.origin) {
      try {
        const parsed = new URL(urlString, window.location.origin);
        return parsed.origin === window.location.origin;
      } catch {
        return false;
      }
    }
    return true;
  }

  install(): void {
    const globalFetch = typeof window !== 'undefined' ? window.fetch : typeof fetch !== 'undefined' ? fetch : undefined;
    if (this.isInstalled || typeof globalFetch !== 'function') {
      return;
    }

    this.originalFetch = globalFetch;
    const self = this;

    const interceptedFetch = async function (
      this: unknown,
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      const urlString = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      // Never intercept ingestion telemetry traffic to avoid recursion loops
      if (urlString && self.ingestionEndpoint && urlString.includes(self.ingestionEndpoint)) {
        return self.originalFetch!.call(this, input, init);
      }

      const method = init?.method?.toUpperCase() || (typeof input === 'object' && 'method' in input ? input.method : 'GET') || 'GET';

      let modifiedInit = init;
      let childSpan: ReturnType<typeof self.contextManager.createChildSpan>;

      // Only inject trace propagation headers if URL is allowed or same-origin
      if (self.shouldPropagateTrace(urlString)) {
        const mergedHeaders = new Headers(
          init?.headers || (typeof input === 'object' && 'headers' in input ? input.headers : undefined)
        );
        const explicitTraceId = mergedHeaders.get('x-trace-id') || undefined;
        childSpan = self.contextManager.createChildSpan(explicitTraceId);
        self.contextManager.injectTraceHeaders(mergedHeaders, childSpan);
        modifiedInit = {
          ...init,
          headers: mergedHeaders,
        };
      } else {
        childSpan = self.contextManager.createChildSpan();
      }

      const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const startIso = new Date().toISOString();

      try {
        const response = await self.originalFetch!.call(this, input, modifiedInit);
        const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const durationNanos = Math.round((endTime - startTime) * 1_000_000);

        const event: Event = {
          event_id: generateEventId(),
          trace_id: childSpan.traceId,
          span_id: childSpan.spanId,
          parent_span_id: childSpan.parentSpanId,
          timestamp: startIso,
          service_name: self.serviceName,
          environment: self.environment,
          event_type: 'function_execution',
          payload: {
            type: 'function_execution',
            data: {
              function: {
                module: 'browser.http',
                class_name: 'Fetch',
                function_name: `${method} ${self.extractPathname(urlString)}`,
              },
              duration_nanos: durationNanos,
              status: response.ok ? 'success' : 'error',
              attributes: {
                'http.method': method,
                'http.url': urlString,
                'http.status_code': response.status,
                'http.status_text': response.statusText,
              },
            },
          },
        };

        self.emitCallback(event);
        return response;
      } catch (error) {
        const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const durationNanos = Math.round((endTime - startTime) * 1_000_000);

        const event: Event = {
          event_id: generateEventId(),
          trace_id: childSpan.traceId,
          span_id: childSpan.spanId,
          parent_span_id: childSpan.parentSpanId,
          timestamp: startIso,
          service_name: self.serviceName,
          environment: self.environment,
          event_type: 'function_execution',
          payload: {
            type: 'function_execution',
            data: {
              function: {
                module: 'browser.http',
                class_name: 'Fetch',
                function_name: `${method} ${self.extractPathname(urlString)}`,
              },
              duration_nanos: durationNanos,
              status: 'error',
              error: createExecutionError(error),
              attributes: {
                'http.method': method,
                'http.url': urlString,
              },
            },
          },
        };

        self.emitCallback(event);
        throw error;
      }
    };

    if (typeof window !== 'undefined') {
      window.fetch = interceptedFetch;
    }
    if (typeof globalThis !== 'undefined') {
      globalThis.fetch = interceptedFetch;
    }

    this.isInstalled = true;
  }

  private extractPathname(urlString: string): string {
    try {
      const parsed = new URL(urlString, typeof window !== 'undefined' ? window.location?.origin : 'http://localhost');
      return parsed.pathname;
    } catch {
      return urlString;
    }
  }

  uninstall(): void {
    if (this.isInstalled && this.originalFetch) {
      if (typeof window !== 'undefined') {
        window.fetch = this.originalFetch;
      }
      if (typeof globalThis !== 'undefined') {
        globalThis.fetch = this.originalFetch;
      }
      this.originalFetch = null;
      this.isInstalled = false;
    }
  }
}
