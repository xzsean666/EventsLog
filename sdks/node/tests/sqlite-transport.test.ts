import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SqliteTransport } from '../src/transport/sqlite.js';
import { EventBatcher } from '../src/batching/batcher.js';
import type { Event } from '../src/protocol/types.js';

describe('SqliteTransport (In-Process Local Mode)', () => {
  const testDbFile = path.resolve('./temp-test-eventslog.db');

  afterEach(() => {
    if (fs.existsSync(testDbFile)) {
      try {
        fs.unlinkSync(testDbFile);
      } catch {
        // ignore
      }
    }
  });

  function createTestEvent(overrides: Partial<Event> = {}): Event {
    return {
      event_id: '00000000-0000-0000-0000-000000000001',
      trace_id: 'trace-local-1',
      span_id: 'span-local-1',
      parent_span_id: '',
      timestamp: new Date().toISOString(),
      service_name: 'test-node-app',
      environment: 'local',
      event_type: 'function.execution',
      payload: {
        function: {
          module: 'src/services/order.ts',
          class_name: 'OrderService',
          function_name: 'createOrder',
          file_path: 'src/services/order.ts',
          line_number: 42,
        },
        input_payload: { orderId: 101, amount: 99.5 },
        output_payload: { status: 'created', success: true },
        duration_nanos: 15_000_000,
        status: 'success',
      },
      ...overrides,
    };
  }

  it('initializes in-memory SQLite and persists a batch of events', async () => {
    const transport = new SqliteTransport({ dbPath: ':memory:' });

    const event1 = createTestEvent();
    const event2 = createTestEvent({
      event_id: '00000000-0000-0000-0000-000000000002',
      span_id: 'span-local-2',
      parent_span_id: 'span-local-1',
      payload: {
        function: {
          module: 'src/services/payment.ts',
          function_name: 'charge',
        },
        duration_nanos: 8_000_000,
        status: 'success',
      },
    });

    const success = await transport.sendBatch([event1, event2]);
    expect(success).toBe(true);

    transport.close();
  });

  it('persists events to a physical SQLite file and verifies database schema', async () => {
    const transport = new SqliteTransport({ dbPath: testDbFile });

    const event = createTestEvent({
      event_id: '11111111-1111-1111-1111-111111111111',
      trace_id: 'trace-file-1',
      span_id: 'span-file-1',
    });

    const success = await transport.sendBatch([event]);
    expect(success).toBe(true);
    transport.close();

    // Verify file exists
    expect(fs.existsSync(testDbFile)).toBe(true);

    // Read directly using node:sqlite to verify written row
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(testDbFile);
    const row = db
      .prepare('SELECT * FROM executions WHERE event_id = ?')
      .get('11111111-1111-1111-1111-111111111111') as any;

    expect(row).toBeDefined();
    expect(row.trace_id).toBe('trace-file-1');
    expect(row.span_id).toBe('span-file-1');
    expect(row.service_name).toBe('test-node-app');
    expect(row.module_name).toBe('src/services/order.ts');
    expect(row.class_name).toBe('OrderService');
    expect(row.function_name).toBe('createOrder');
    expect(row.duration_ms).toBe(15.0);
    expect(row.status).toBe('success');
    expect(JSON.parse(row.input_json)).toEqual({ orderId: 101, amount: 99.5 });
    expect(JSON.parse(row.output_json)).toEqual({ status: 'created', success: true });

    db.close();
  });

  it('integrates seamlessly with EventBatcher in local mode', async () => {
    const transport = new SqliteTransport({ dbPath: testDbFile });
    const batcher = new EventBatcher({
      maxBatchSize: 10,
      flushIntervalMs: 1000,
      transport,
    });

    const event = createTestEvent({
      event_id: '22222222-2222-2222-2222-222222222222',
      trace_id: 'trace-batcher-1',
    });

    batcher.push(event);
    await batcher.flush();
    transport.close();

    // Verify row in database
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(testDbFile);
    const row = db
      .prepare('SELECT function_name, trace_id FROM executions WHERE event_id = ?')
      .get('22222222-2222-2222-2222-222222222222') as any;

    expect(row).toBeDefined();
    expect(row.function_name).toBe('createOrder');
    expect(row.trace_id).toBe('trace-batcher-1');
    db.close();
  });
});
