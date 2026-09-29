export interface FunctionSummary {
  function_id: string;
  service_name: string;
  module: string;
  class_name?: string;
  function_name: string;
  total_executions: number;
  total_errors: number;
  avg_duration_ms: number;
  last_seen: string;
}

export interface ExecutionError {
  type_name: string;
  message: string;
  stack_trace?: string;
}

export interface ExecutionRecord {
  execution_id: string;
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  service_name: string;
  environment: string;
  module: string;
  class_name?: string;
  function_name: string;
  status: 'success' | 'error' | 'timeout' | 'dropped';
  duration_ms: number;
  timestamp: string;
  input_payload?: unknown;
  output_payload?: unknown;
  error?: ExecutionError;
}

export interface TraceNode {
  span_id: string;
  parent_span_id?: string;
  service_name: string;
  module: string;
  class_name?: string;
  function_name: string;
  status: string;
  duration_ms: number;
  timestamp: string;
  children: TraceNode[];
}

export interface TraceTree {
  trace_id: string;
  root_spans: TraceNode[];
  total_spans: number;
  total_duration_ms: number;
}

export interface ServiceStats {
  total_executions: number;
  total_errors: number;
  error_rate: number;
  p50_duration_ms: number;
  p95_duration_ms: number;
  p99_duration_ms: number;
}
