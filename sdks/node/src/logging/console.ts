import * as crypto from 'node:crypto';
import type { Event, FunctionExecution } from '../protocol/types.js';
import { currentContext, generateSpanId } from '../tracing/context.js';
import { capturePayload } from '../sanitization/limiter.js';
import type { EventsLogConfig } from '../config/types.js';
import type { EventSink } from '../instrumentation/wrapper.js';

let isHookInstalled = false;
let isInternalLogging = false;

/**
 * Installs non-intrusive console interception.
 * When called inside an observed function execution trace, console outputs
 * (log, info, warn, error) are automatically captured as child spans in the trace tree.
 */
export function installConsoleHook(config: EventsLogConfig, sink: EventSink): void {
  if (isHookInstalled) {
    return;
  }
  isHookInstalled = true;

  const methods: Array<'log' | 'info' | 'warn' | 'error'> = ['log', 'info', 'warn', 'error'];

  for (const method of methods) {
    const original = console[method];
    console[method] = function (this: any, ...args: any[]) {
      // 1. Always execute original console method first to preserve terminal output
      original.apply(this, args);

      // 2. Prevent recursion when SDK logs internal diagnostic warnings
      if (isInternalLogging) {
        return;
      }

      // 3. Only capture when inside an active distributed trace context
      const ctx = currentContext();
      if (!ctx) {
        return;
      }

      isInternalLogging = true;
      try {
        const sanitized = capturePayload(
          args.length === 1 ? args[0] : args,
          { sensitiveKeys: config.instrumentation.sensitive_keys },
          config.instrumentation.max_payload_bytes
        );

        const execution: FunctionExecution = {
          function: {
            module: 'console',
            class_name: 'Console',
            function_name: method,
          },
          input_payload: sanitized,
          output_payload: undefined,
          duration_nanos: 0,
          status: method === 'error' ? 'error' : 'success',
          error:
            method === 'error' && args.length > 0 && args[0] instanceof Error
              ? {
                  type_name: args[0].name,
                  message: args[0].message,
                  stack_trace: args[0].stack,
                }
              : undefined,
        };

        const event: Event = {
          event_id: crypto.randomUUID(),
          trace_id: ctx.traceId,
          span_id: generateSpanId(),
          parent_span_id: ctx.spanId,
          timestamp: new Date().toISOString(),
          service_name: config.service_name,
          environment: config.environment,
          event_type: 'function_execution',
          payload: {
            type: 'function_execution',
            data: execution,
          },
        };

        sink(event);
      } catch {
        // Complete isolation: never crash host application
      } finally {
        isInternalLogging = false;
      }
    };
  }
}
