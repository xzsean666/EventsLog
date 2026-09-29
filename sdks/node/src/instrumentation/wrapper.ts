import * as crypto from 'node:crypto';
import {
  type Event,
  type FunctionIdentity,
  type FunctionExecution,
  createExecutionError,
} from '../protocol/types.js';
import { createChildSpan, runWithContext } from '../tracing/context.js';
import { capturePayload } from '../sanitization/limiter.js';
import type { SanitizerOptions } from '../sanitization/sanitizer.js';

export const IS_WRAPPED = Symbol.for('eventslog.isWrapped');
export const ORIGINAL_FN = Symbol.for('eventslog.originalFn');

export type EventSink = (event: Event) => void;

export interface WrapOptions {
  serviceName?: string;
  environment?: string;
  samplingRate?: number;
  maxPayloadBytes?: number;
  sanitizerOptions?: SanitizerOptions;
  sink?: EventSink;
}

/**
 * Wraps a synchronous or asynchronous function with automatic execution tracing,
 * payload capture, duration timing, and event emission.
 */
export function wrapFunction<T extends (...args: any[]) => any>(
  fn: T,
  identity: FunctionIdentity,
  options: WrapOptions = {}
): T {
  if (typeof fn !== 'function') {
    return fn;
  }

  // Prevent double wrapping
  if ((fn as any)[IS_WRAPPED]) {
    return fn;
  }

  const serviceName = options.serviceName || 'node-service';
  const environment = options.environment || 'development';
  const samplingRate = options.samplingRate ?? 1.0;
  const maxPayloadBytes = options.maxPayloadBytes ?? 65536;
  const sink = options.sink;

  const wrapped = function (this: any, ...args: any[]): any {
    // Check sampling rate
    if (samplingRate < 1.0 && Math.random() > samplingRate) {
      return fn.apply(this, args);
    }

    const childContext = createChildSpan();
    let sanitizedInputs: unknown;
    try {
      sanitizedInputs = capturePayload(
        args.length === 1 ? args[0] : args,
        options.sanitizerOptions,
        maxPayloadBytes
      );
    } catch {
      sanitizedInputs = '[UNSERIALIZABLE_INPUT]';
    }

    return runWithContext(childContext, () => {
      let result: any;
      const startNanos = process.hrtime.bigint();
      try {
        result = fn.apply(this, args);
      } catch (err) {
        const durationNanos = Number(process.hrtime.bigint() - startNanos);
        emitExecutionEvent({
          context: childContext,
          identity,
          serviceName,
          environment,
          inputPayload: sanitizedInputs,
          outputPayload: undefined,
          durationNanos,
          status: 'error',
          error: createExecutionError(err),
          sink,
        });
        throw err;
      }

      // Check if result is a Promise
      if (result && typeof result.then === 'function') {
        return (result as Promise<any>).then(
          (resolvedValue) => {
            const durationNanos = Number(process.hrtime.bigint() - startNanos);
            let sanitizedOutput: unknown;
            try {
              sanitizedOutput = capturePayload(
                resolvedValue,
                options.sanitizerOptions,
                maxPayloadBytes
              );
            } catch {
              sanitizedOutput = '[UNSERIALIZABLE_OUTPUT]';
            }
            emitExecutionEvent({
              context: childContext,
              identity,
              serviceName,
              environment,
              inputPayload: sanitizedInputs,
              outputPayload: sanitizedOutput,
              durationNanos,
              status: 'success',
              error: undefined,
              sink,
            });
            return resolvedValue;
          },
          (rejectionErr) => {
            const durationNanos = Number(process.hrtime.bigint() - startNanos);
            emitExecutionEvent({
              context: childContext,
              identity,
              serviceName,
              environment,
              inputPayload: sanitizedInputs,
              outputPayload: undefined,
              durationNanos,
              status: 'error',
              error: createExecutionError(rejectionErr),
              sink,
            });
            throw rejectionErr;
          }
        );
      }

      // Synchronous return
      const durationNanos = Number(process.hrtime.bigint() - startNanos);
      let sanitizedOutput: unknown;
      try {
        sanitizedOutput = capturePayload(result, options.sanitizerOptions, maxPayloadBytes);
      } catch {
        sanitizedOutput = '[UNSERIALIZABLE_OUTPUT]';
      }

      emitExecutionEvent({
        context: childContext,
        identity,
        serviceName,
        environment,
        inputPayload: sanitizedInputs,
        outputPayload: sanitizedOutput,
        durationNanos,
        status: 'success',
        error: undefined,
        sink,
      });

      return result;
    });
  };

  // Preserve metadata, original reference, and static properties
  Object.defineProperty(wrapped, 'name', { value: fn.name, configurable: true });
  Object.defineProperty(wrapped, 'length', { value: fn.length, configurable: true });
  (wrapped as any)[IS_WRAPPED] = true;
  (wrapped as any)[ORIGINAL_FN] = fn;

  const staticProps = Object.getOwnPropertyNames(fn);
  for (const prop of staticProps) {
    if (!['prototype', 'length', 'name', 'arguments', 'caller'].includes(prop)) {
      try {
        const desc = Object.getOwnPropertyDescriptor(fn, prop);
        if (desc) {
          Object.defineProperty(wrapped, prop, desc);
        }
      } catch {
        // Skip unconfigurable properties
      }
    }
  }

  return wrapped as unknown as T;
}

interface EmitParams {
  context: { traceId: string; spanId: string; parentSpanId?: string };
  identity: FunctionIdentity;
  serviceName: string;
  environment: string;
  inputPayload: unknown;
  outputPayload: unknown;
  durationNanos: number;
  status: 'success' | 'error';
  error?: ReturnType<typeof createExecutionError>;
  sink?: EventSink;
}

function emitExecutionEvent(params: EmitParams): void {
  if (!params.sink) {
    return;
  }

  const execution: FunctionExecution = {
    function: params.identity,
    input_payload: params.inputPayload,
    output_payload: params.outputPayload,
    duration_nanos: params.durationNanos,
    status: params.status,
    error: params.error,
  };

  const event: Event = {
    event_id: crypto.randomUUID(),
    trace_id: params.context.traceId,
    span_id: params.context.spanId,
    parent_span_id: params.context.parentSpanId,
    timestamp: new Date().toISOString(),
    service_name: params.serviceName,
    environment: params.environment,
    event_type: 'function_execution',
    payload: {
      type: 'function_execution',
      data: execution,
    },
  };

  try {
    params.sink(event);
  } catch (err) {
    // Sinks should not crash application flow
    console.error('[EventsLog] Failed to emit execution event to sink:', err);
  }
}
