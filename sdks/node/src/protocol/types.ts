/**
 * Category of an observed event in the EventsLog platform.
 */
export type EventType = 'function_execution' | 'system' | 'metric' | 'error';

/**
 * Execution status outcome for a function call.
 */
export type ExecutionStatus = 'success' | 'error' | 'timeout' | 'dropped';

/**
 * Uniquely identifies an observed function or callable within an application codebase.
 */
export interface FunctionIdentity {
  /**
   * Module, package, or namespace identifier (e.g. `services.order` or `src/services/order.ts`).
   */
  module: string;
  /**
   * Optional enclosing class, struct, or object name (e.g. `OrderService`).
   */
  class_name?: string;
  /**
   * Name of the function, method, or callable (e.g. `createOrder`).
   */
  function_name: string;
  /**
   * Optional source file path where the function is declared.
   */
  file_path?: string;
  /**
   * Optional source file line number.
   */
  line_number?: number;
}

/**
 * Represents an execution error captured from an observed function or system runtime.
 */
export interface ExecutionError {
  /**
   * The class or type name of the error (e.g. `TypeError`, `CustomException`).
   */
  type_name: string;
  /**
   * The human-readable error message.
   */
  message: string;
  /**
   * Optional stack trace or call frames string.
   */
  stack_trace?: string;
}

/**
 * Generic key-value attributes/metadata container.
 */
export type Attributes = Record<string, unknown>;

/**
 * Full execution payload of an observed function call.
 */
export interface FunctionExecution {
  /**
   * Identity and location of the observed function.
   */
  function: FunctionIdentity;
  /**
   * Captured function input arguments (sanitized JSON).
   */
  input_payload?: unknown;
  /**
   * Captured function return value (sanitized JSON).
   */
  output_payload?: unknown;
  /**
   * Wall-clock execution duration in nanoseconds.
   */
  duration_nanos: number;
  /**
   * Final execution status.
   */
  status: ExecutionStatus;
  /**
   * Error details if the execution failed.
   */
  error?: ExecutionError;
  /**
   * Optional metadata or execution tags.
   */
  attributes?: Attributes;
}

/**
 * Payload variants supported in standard EventsLog events.
 * Serde tag="type", content="data", rename_all="snake_case".
 */
export type EventPayload =
  | { type: 'function_execution'; data: FunctionExecution }
  | { type: 'system'; data: unknown }
  | { type: 'metric'; data: unknown }
  | { type: 'error'; data: ExecutionError }
  | { type: 'custom'; data: unknown };

/**
 * Top-level envelope for all EventsLog telemetry data.
 */
export interface Event {
  /**
   * Unique event identifier (UUID v4 format).
   */
  event_id: string;
  /**
   * Distributed trace identifier.
   */
  trace_id: string;
  /**
   * Current execution span identifier.
   */
  span_id: string;
  /**
   * Enclosing/parent execution span identifier, if any.
   */
  parent_span_id?: string;
  /**
   * UTC timestamp of event creation or occurrence (ISO 8601).
   */
  timestamp: string;
  /**
   * Originating service or application name.
   */
  service_name: string;
  /**
   * Deployment environment (e.g. `production`, `staging`, `local`).
   */
  environment: string;
  /**
   * Event category.
   */
  event_type: EventType;
  /**
   * Embedded typed payload.
   */
  payload: EventPayload;
}

/**
 * Request/transfer wrapper containing a batch of events sent by client SDKs.
 */
export interface BatchEventPayload {
  /**
   * Ordered list of events included in this batch.
   */
  events: Event[];
}

export const PROTOCOL_VERSION = '1.0.0';

/**
 * Helper to build an ExecutionError object from a JavaScript Error or unknown thrown value.
 */
export function createExecutionError(err: unknown): ExecutionError {
  if (err instanceof Error) {
    return {
      type_name: err.name || 'Error',
      message: err.message || String(err),
      stack_trace: err.stack,
    };
  }
  return {
    type_name: typeof err === 'object' && err !== null ? (err.constructor?.name ?? 'Error') : 'UnknownError',
    message: String(err),
  };
}
