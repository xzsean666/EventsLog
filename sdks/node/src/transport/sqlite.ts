import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import type { Event } from '../protocol/types.js';

function loadNodeSqlite(): any {
  try {
    const nodeRequire =
      typeof require !== 'undefined'
        ? require
        : createRequire(path.join(process.cwd(), 'index.js'));
    return nodeRequire('node:sqlite');
  } catch {
    return null;
  }
}

export interface SqliteTransportOptions {
  dbPath?: string;
}

/**
 * In-process SQLite transport for zero-dependency local development and debugging.
 * Directly writes telemetry records into SQLite without requiring any external server.
 */
export class SqliteTransport {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any = null;
  private readonly dbPath: string;
  private isInitialized = false;

  constructor(options: SqliteTransportOptions = {}) {
    this.dbPath = options.dbPath || './eventslog.db';
    this.initDatabase();
  }

  private initDatabase(): void {
    try {
      const sqlite = loadNodeSqlite();
      if (!sqlite || !sqlite.DatabaseSync) {
        console.warn('[EventsLog] node:sqlite is not available in this Node runtime');
        return;
      }


      if (this.dbPath !== ':memory:') {
        const dir = path.dirname(path.resolve(this.dbPath));
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }

      this.db = new sqlite.DatabaseSync(this.dbPath);
      this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA busy_timeout = 5000;

        CREATE TABLE IF NOT EXISTS executions (
            event_id TEXT PRIMARY KEY,
            trace_id TEXT NOT NULL,
            span_id TEXT NOT NULL,
            parent_span_id TEXT NOT NULL DEFAULT '',
            service_name TEXT NOT NULL,
            environment TEXT NOT NULL,
            module_name TEXT NOT NULL,
            class_name TEXT NOT NULL DEFAULT '',
            function_name TEXT NOT NULL,
            file_path TEXT NOT NULL DEFAULT '',
            line_number INTEGER NOT NULL DEFAULT 0,
            input_json TEXT NOT NULL DEFAULT '',
            output_json TEXT NOT NULL DEFAULT '',
            duration_ms REAL NOT NULL DEFAULT 0.0,
            duration_nanos INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'ok',
            error_type TEXT NOT NULL DEFAULT '',
            error_message TEXT NOT NULL DEFAULT '',
            error_stack TEXT NOT NULL DEFAULT '',
            attributes_json TEXT NOT NULL DEFAULT '',
            timestamp TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_exec_fn ON executions(service_name, environment, function_name);
        CREATE INDEX IF NOT EXISTS idx_exec_trace ON executions(trace_id);
        CREATE INDEX IF NOT EXISTS idx_exec_span ON executions(span_id);
        CREATE INDEX IF NOT EXISTS idx_exec_time ON executions(timestamp);
      `);

      this.isInitialized = true;
    } catch (err) {
      console.warn('[EventsLog] Failed to initialize SQLite local storage:', err);
    }
  }

  /**
   * Directly persists an event batch to SQLite inside a single atomic transaction.
   */
  async sendBatch(events: Event[]): Promise<boolean> {
    if (!events || events.length === 0) {
      return true;
    }

    if (!this.isInitialized || !this.db) {
      return false;
    }

    try {
      const insertStmt = this.db.prepare(`
        INSERT OR REPLACE INTO executions (
            event_id, trace_id, span_id, parent_span_id, service_name, environment,
            module_name, class_name, function_name, file_path, line_number,
            input_json, output_json, duration_ms, duration_nanos, status,
            error_type, error_message, error_stack, attributes_json, timestamp
        ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?
        )
      `);

      this.db.exec('BEGIN TRANSACTION;');

      for (const event of events) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload = event.payload as any;
        const execData = payload?.data || payload;
        const func = execData?.function;
        const err = execData?.error;

        const moduleName = func?.module || 'default';
        const className = func?.class_name || '';
        const functionName = func?.function_name || event.event_type || 'anonymous';
        const filePath = func?.file_path || '';
        const lineNumber = func?.line_number || 0;

        const inputJson =
          execData?.input_payload != null
            ? typeof execData.input_payload === 'string'
              ? execData.input_payload
              : JSON.stringify(execData.input_payload)
            : '';
        const outputJson =
          execData?.output_payload != null
            ? typeof execData.output_payload === 'string'
              ? execData.output_payload
              : JSON.stringify(execData.output_payload)
            : '';

        const durationNanos = typeof execData?.duration_nanos === 'number' ? execData.duration_nanos : 0;
        const durationMs = durationNanos > 0 ? durationNanos / 1_000_000 : 0.0;
        const status = execData?.status || 'success';

        const errorType = err?.type_name || '';
        const errorMessage = err?.message || '';
        const errorStack = err?.stack_trace || '';


        const attributesJson =
          payload?.attributes != null
            ? typeof payload.attributes === 'string'
              ? payload.attributes
              : JSON.stringify(payload.attributes)
            : '';

        const timestampStr =
          typeof event.timestamp === 'string'
            ? event.timestamp
            : String(event.timestamp || new Date().toISOString());

        insertStmt.run(
          event.event_id,
          event.trace_id,
          event.span_id,
          event.parent_span_id || '',
          event.service_name,
          event.environment,
          moduleName,
          className,
          functionName,
          filePath,
          lineNumber,
          inputJson,
          outputJson,
          durationMs,
          durationNanos,
          status,
          errorType,
          errorMessage,
          errorStack,
          attributesJson,
          timestampStr
        );
      }

      this.db.exec('COMMIT;');
      return true;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {
        // ignore rollback error
      }
      console.warn('[EventsLog] Failed to save batch to SQLite local storage:', err);
      return false;
    }
  }

  close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // ignore
      }
      this.db = null;
      this.isInitialized = false;
    }
  }
}
