import {
  Injectable,
  NestMiddleware,
  CallHandler,
  ExecutionContext,
  NestInterceptor,
  DynamicModule,
  Global,
  Module,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  runWithContext,
  currentContext,
  createRootContext,
  generateSpanId,
  patchClass,
  type TraceContext,
  type EventsLogConfig,
  type EventSink,
} from '@eventslog/node';

/**
 * Extracts distributed trace context from inbound HTTP request headers.
 */
export function extractTraceContextFromHeaders(headers: Record<string, string | string[] | undefined>): TraceContext {
  const getHeader = (name: string): string | undefined => {
    const val = headers[name.toLowerCase()] || headers[name];
    if (Array.isArray(val)) return val[0];
    return val;
  };

  const directTraceId = getHeader('x-trace-id');
  const directSpanId = getHeader('x-span-id');
  const traceParent = getHeader('traceparent');

  if (traceParent) {
    // Format: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
    const parts = traceParent.split('-');
    if (parts.length >= 4 && parts[1] && parts[2]) {
      return {
        traceId: parts[1],
        spanId: parts[2],
        baggage: {},
      };
    }
  }

  if (directTraceId) {
    return {
      traceId: directTraceId,
      spanId: directSpanId || generateSpanId(),
      baggage: {},
    };
  }

  return createRootContext();
}

/**
 * Express / NestJS middleware that wraps the HTTP request in a distributed trace context.
 */
@Injectable()
export class EventsLogTraceMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    const context = extractTraceContextFromHeaders(req.headers);

    // Propagate traceId back to client in response header
    res.setHeader('x-trace-id', context.traceId);

    // Execute the request pipeline in this trace context
    runWithContext(context, () => {
      next();
    });
  }
}

/**
 * Utility to patch NestJS controllers and services with EventsLog function observability.
 */
export function instrumentNestApp(
  classes: Array<new (...args: any[]) => any>,
  config: EventsLogConfig,
  sink: EventSink
) {
  for (const cls of classes) {
    patchClass(cls, cls.name, `nestjs/${cls.name}`, config, sink);
  }
}
