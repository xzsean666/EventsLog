import {
  BrowserConfig,
  Event,
  FunctionExecution,
  Attributes,
  createExecutionError,
} from './protocol/types';
import { BrowserContextManager, defaultContextManager, generateEventId, SpanContext } from './tracing/context';
import { BrowserSanitizer } from './sanitization/sanitizer';
import { BrowserBatchBuffer } from './transport/buffer';
import { IndexedDBStorage } from './transport/indexeddb';
import { mountDevTools, type DevToolsController } from './devtools';
import { GlobalErrorInterceptor } from './interceptors/errors';
import { FetchInterceptor } from './interceptors/fetch';
import { ConsoleInterceptor } from './interceptors/console';

export class EventsLogBrowserClient {
  public readonly config: Required<
    Omit<BrowserConfig, 'apiKey' | 'headers' | 'sanitizeKeys' | 'allowedTracingOrigins'>
  > & {
    apiKey?: string;
    headers?: Record<string, string>;
    sanitizeKeys?: string[];
    allowedTracingOrigins?: (string | RegExp)[];
  };

  public readonly contextManager: BrowserContextManager;
  public readonly sanitizer: BrowserSanitizer;
  public readonly buffer: BrowserBatchBuffer;
  public readonly storage: IndexedDBStorage;
  public readonly devtoolsController?: DevToolsController;

  private errorInterceptor: GlobalErrorInterceptor | null = null;
  private fetchInterceptor: FetchInterceptor | null = null;
  private consoleInterceptor: ConsoleInterceptor | null = null;

  constructor(config: BrowserConfig, contextManager = defaultContextManager) {
    this.config = {
      serviceName: config.serviceName,
      environment: config.environment || 'production',
      endpoint: config.endpoint || 'http://localhost:8001/v1/events',
      apiKey: config.apiKey,
      batchSize: config.batchSize ?? 30,
      flushIntervalMs: config.flushIntervalMs ?? 5000,
      maxQueueSize: config.maxQueueSize ?? 1000,
      captureErrors: config.captureErrors ?? true,
      captureFetch: config.captureFetch ?? true,
      captureConsole: config.captureConsole ?? false,
      sanitizeKeys: config.sanitizeKeys,
      maxPayloadBytes: config.maxPayloadBytes ?? 32 * 1024,
      headers: config.headers,
      allowedTracingOrigins: config.allowedTracingOrigins,
      mode: config.mode || 'auto',
      indexedDbName: config.indexedDbName || 'eventslog_db',
      devtools: config.devtools ?? false,
      disabled: config.disabled ?? false,
    };

    this.contextManager = contextManager;
    this.sanitizer = new BrowserSanitizer({
      customSensitiveKeys: this.config.sanitizeKeys,
      maxPayloadBytes: this.config.maxPayloadBytes,
    });

    this.storage = new IndexedDBStorage({
      dbName: this.config.indexedDbName,
    });

    this.buffer = new BrowserBatchBuffer({
      endpoint: this.config.endpoint,
      apiKey: this.config.apiKey,
      batchSize: this.config.batchSize,
      flushIntervalMs: this.config.flushIntervalMs,
      maxQueueSize: this.config.maxQueueSize,
      headers: this.config.headers,
      disabled: this.config.disabled,
      mode: this.config.mode,
      storage: this.storage,
    });

    if (this.config.devtools && typeof window !== 'undefined') {
      this.devtoolsController = mountDevTools(this);
    }

    this.initInterceptors();
  }

  private initInterceptors(): void {
    if (this.config.disabled) return;

    if (this.config.captureErrors) {
      this.errorInterceptor = new GlobalErrorInterceptor((error, source) => {
        this.captureError(error, source ? { 'source.file': source.file, 'source.line': source.line } : undefined);
      });
      this.errorInterceptor.install();
    }

    if (this.config.captureFetch) {
      this.fetchInterceptor = new FetchInterceptor(
        this.contextManager,
        (event) => this.recordEvent(event),
        {
          ingestionEndpoint: this.config.endpoint,
          serviceName: this.config.serviceName,
          environment: this.config.environment,
          allowedTracingOrigins: this.config.allowedTracingOrigins,
        }
      );
      this.fetchInterceptor.install();
    }

    if (this.config.captureConsole) {
      this.consoleInterceptor = new ConsoleInterceptor(
        this.contextManager,
        (event) => this.recordEvent(event),
        {
          serviceName: this.config.serviceName,
          environment: this.config.environment,
        }
      );
      this.consoleInterceptor.install();
    }
  }

  recordEvent(event: Event): void {
    this.buffer.enqueue(event);
  }

  /**
   * Retrieves the currently active span context in the browser execution flow.
   */
  getCurrentSpan(): SpanContext | undefined {
    return this.contextManager.getCurrentSpan();
  }

  /**
   * Tracks execution of a synchronous or asynchronous function within a new child span.
   */
  startSpan<T>(name: string, fn: () => T, attributes?: Attributes): T {
    const spanContext = this.contextManager.createChildSpan();
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const timestamp = new Date().toISOString();

    const parts = name.split('.');
    const functionName = parts.pop() || name;
    const moduleName = parts.join('.') || 'app';

    return this.contextManager.runInContext(spanContext, () => {
      try {
        const result = fn();

        if (
          result !== null &&
          (typeof result === 'object' || typeof result === 'function') &&
          typeof (result as unknown as { then?: unknown }).then === 'function'
        ) {
          return ((result as unknown as Promise<unknown>)
            .then((val) => {
              const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
              const durationNanos = Math.round((endTime - startTime) * 1_000_000);

              const execution: FunctionExecution = {
                function: {
                  module: moduleName,
                  function_name: functionName,
                },
                duration_nanos: durationNanos,
                status: 'success',
                output_payload: this.sanitizer.sanitize(val),
                attributes,
              };

              this.recordEvent({
                event_id: generateEventId(),
                trace_id: spanContext.traceId,
                span_id: spanContext.spanId,
                parent_span_id: spanContext.parentSpanId,
                timestamp,
                service_name: this.config.serviceName,
                environment: this.config.environment,
                event_type: 'function_execution',
                payload: {
                  type: 'function_execution',
                  data: execution,
                },
              });

              return val;
            })
            .catch((err) => {
              const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
              const durationNanos = Math.round((endTime - startTime) * 1_000_000);

              const execution: FunctionExecution = {
                function: {
                  module: moduleName,
                  function_name: functionName,
                },
                duration_nanos: durationNanos,
                status: 'error',
                error: createExecutionError(err),
                attributes,
              };

              this.recordEvent({
                event_id: generateEventId(),
                trace_id: spanContext.traceId,
                span_id: spanContext.spanId,
                parent_span_id: spanContext.parentSpanId,
                timestamp,
                service_name: this.config.serviceName,
                environment: this.config.environment,
                event_type: 'function_execution',
                payload: {
                  type: 'function_execution',
                  data: execution,
                },
              });

              throw err;
            })) as unknown as T;
        }

        const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const durationNanos = Math.round((endTime - startTime) * 1_000_000);

        const execution: FunctionExecution = {
          function: {
            module: moduleName,
            function_name: functionName,
          },
          duration_nanos: durationNanos,
          status: 'success',
          output_payload: this.sanitizer.sanitize(result),
          attributes,
        };

        this.recordEvent({
          event_id: generateEventId(),
          trace_id: spanContext.traceId,
          span_id: spanContext.spanId,
          parent_span_id: spanContext.parentSpanId,
          timestamp,
          service_name: this.config.serviceName,
          environment: this.config.environment,
          event_type: 'function_execution',
          payload: {
            type: 'function_execution',
            data: execution,
          },
        });

        return result;
      } catch (err) {
        const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const durationNanos = Math.round((endTime - startTime) * 1_000_000);

        const execution: FunctionExecution = {
          function: {
            module: moduleName,
            function_name: functionName,
          },
          duration_nanos: durationNanos,
          status: 'error',
          error: createExecutionError(err),
          attributes,
        };

        this.recordEvent({
          event_id: generateEventId(),
          trace_id: spanContext.traceId,
          span_id: spanContext.spanId,
          parent_span_id: spanContext.parentSpanId,
          timestamp,
          service_name: this.config.serviceName,
          environment: this.config.environment,
          event_type: 'function_execution',
          payload: {
            type: 'function_execution',
            data: execution,
          },
        });

        throw err;
      }
    });
  }

  /**
   * Explicit helper for tracing asynchronous functions.
   */
  async traceAsync<T>(name: string, fn: () => Promise<T>, attributes?: Attributes): Promise<T> {
    return this.startSpan(name, fn, attributes);
  }

  /**
   * Wraps an arbitrary function to automatically trace every invocation with inputs and outputs.
   */
  wrapFunction<F extends (...args: any[]) => any>(fn: F, name?: string): F {
    const fnName = name || fn.name || 'anonymous';
    const self = this;

    const wrapped = function (this: unknown, ...args: Parameters<F>): ReturnType<F> {
      const sanitizedInputs = self.sanitizer.sanitize(args);
      return self.startSpan(
        fnName,
        () => fn.apply(this, args),
        { 'fn.inputs': sanitizedInputs }
      );
    };

    return wrapped as unknown as F;
  }

  /**
   * Manually captures an error and transmits it to EventsLog.
   */
  captureError(error: unknown, attributes?: Attributes): void {
    const currentSpan = this.contextManager.getCurrentSpan();
    const spanContext = currentSpan || this.contextManager.createChildSpan();
    const executionError = createExecutionError(error);

    const event: Event = {
      event_id: generateEventId(),
      trace_id: spanContext.traceId,
      span_id: spanContext.spanId,
      parent_span_id: spanContext.parentSpanId,
      timestamp: new Date().toISOString(),
      service_name: this.config.serviceName,
      environment: this.config.environment,
      event_type: 'error',
      payload: {
        type: 'error',
        data: executionError,
      },
    };

    this.recordEvent(event);
  }

  async flush(): Promise<void> {
    await this.buffer.flush();
  }

  destroy(): void {
    this.devtoolsController?.destroy();
    this.errorInterceptor?.uninstall();
    this.fetchInterceptor?.uninstall();
    this.consoleInterceptor?.uninstall();
    this.buffer.destroy();
    this.storage.close();
  }
}
