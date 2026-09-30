/**
 * Configuration for the in-memory ring buffer and auto-batching transport.
 */
export interface BatchingConfig {
  /**
   * Number of records required to trigger an immediate batch flush.
   * Default: 100.
   */
  max_batch_size: number;
  /**
   * Maximum duration in milliseconds before buffered records are flushed.
   * Default: 500 ms.
   */
  flush_interval_ms: number;
  /**
   * Maximum number of events buffered in memory before dropping new events.
   * Default: 5000.
   */
  max_queue_size: number;
}

/**
 * Configuration for function observation rules and data masking.
 */
export interface InstrumentationConfig {
  /**
   * Glob patterns matching classes, functions, or file paths to observe.
   * Example: `["OrderService.*", "src/services/**\/*.ts"]`.
   */
  include: string[];
  /**
   * Glob patterns matching classes, functions, or file paths to exclude.
   * Exclude rules strictly take precedence over include rules.
   * Example: `["*.toJSON", "*.toString", "OrderService.internal*"]`.
   */
  exclude: string[];
  /**
   * Sampling rate between 0.0 and 1.0 (1.0 = 100% of executions observed).
   * Default: 1.0.
   */
  sampling_rate: number;
  /**
   * Case-insensitive field keys to sanitize in input/output payloads.
   */
  sensitive_keys: string[];
  /**
   * Maximum payload size in bytes before serialization truncation.
   * Default: 65536 (64 KB).
   */
  max_payload_bytes: number;
}

export type TelemetryMode = 'remote' | 'local' | 'auto';

/**
 * Top-level EventsLog client configuration.
 */
export interface EventsLogConfig {
  /**
   * Telemetry mode:
   * - 'remote': Sends events to remote Ingestion HTTP service.
   * - 'local': Directly writes events into local SQLite database in-process (zero-dependency).
   * - 'auto': Uses remote endpoint if explicitly configured, otherwise local SQLite.
   * Default: 'auto'.
   */
  mode: TelemetryMode;
  /**
   * Path to the SQLite database file when running in local mode.
   * Default: `./eventslog.db`.
   */
  sqlite_path: string;
  /**
   * Ingestion service HTTP endpoint URL.
   * Default: `http://127.0.0.1:8080/v1/events`.
   */
  endpoint: string;
  /**
   * Project API key for authentication (`x-api-key`).
   */
  api_key: string;
  /**
   * Identifying name of the running service or microservice.
   * Default: `node-service`.
   */
  service_name: string;
  /**
   * Deployment environment name (e.g. `production`, `staging`, `development`).
   * Default: `development`.
   */
  environment: string;
  /**
   * Auto-batching engine configuration.
   */
  batching: BatchingConfig;
  /**
   * Codebase observation and masking configuration.
   */
  instrumentation: InstrumentationConfig;
}

export const DEFAULT_SENSITIVE_KEYS: string[] = [
  'password',
  'token',
  'secret',
  'authorization',
  'api_key',
  'access_token',
  'refresh_token',
  'private_key',
];

export const DEFAULT_BATCHING_CONFIG: BatchingConfig = {
  max_batch_size: 100,
  flush_interval_ms: 500,
  max_queue_size: 5000,
};

export const DEFAULT_INSTRUMENTATION_CONFIG: InstrumentationConfig = {
  include: [],
  exclude: [],
  sampling_rate: 1.0,
  sensitive_keys: DEFAULT_SENSITIVE_KEYS,
  max_payload_bytes: 65536,
};

export const DEFAULT_CONFIG: EventsLogConfig = {
  mode: 'auto',
  sqlite_path: './eventslog.db',
  endpoint: 'http://127.0.0.1:8080/v1/events',
  api_key: '',
  service_name: 'node-service',
  environment: 'development',
  batching: DEFAULT_BATCHING_CONFIG,
  instrumentation: DEFAULT_INSTRUMENTATION_CONFIG,
};

