import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawn } from 'node:child_process';
import type { BatchEventPayload } from '../src/index.js';

describe('Zero-Code Loader & Auto-Registration Integration', () => {
  let server: http.Server;
  let serverPort: number;
  let receivedBatches: BatchEventPayload[] = [];
  let tempDir: string;

  beforeAll(async () => {
    // 1. Start mock ingestion server
    server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/v1/events') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body) as BatchEventPayload;
            receivedBatches.push(parsed);
            res.writeHead(202, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'accepted' }));
          } catch (err) {
            res.writeHead(400);
            res.end();
          }
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        resolve();
      });
    });

    // 2. Create temporary test workspace
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventslog-integration-'));

    // Create a business service module
    const serviceCode = `
class Calculator {
  add(a, b) {
    return a + b;
  }
  multiply(a, b) {
    return a * b;
  }
}
module.exports = { Calculator };
`;
    fs.writeFileSync(path.join(tempDir, 'calculator.js'), serviceCode);

    // Create app entry point
    const appCode = `
const { Calculator } = require('./calculator');
const calc = new Calculator();
const sum = calc.add(10, 20);
const prod = calc.multiply(3, 4);
console.log('App execution finished: sum=' + sum + ' prod=' + prod);
`;
    fs.writeFileSync(path.join(tempDir, 'app.js'), appCode);

    // Create configuration file in tempDir
    const configYaml = `
service_name: zero-code-integration-app
environment: test
batching:
  max_batch_size: 10
  flush_interval_ms: 100
instrumentation:
  include:
    - "Calculator.*"
    - "calculator:*"
    - "*"
`;
    fs.writeFileSync(path.join(tempDir, 'eventslog.yaml'), configYaml);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should auto-intercept functions and flush telemetry on process exit via -r', async () => {
    receivedBatches = [];
    const registerPath = path.resolve(__dirname, '../dist/register.js');

    const child = spawn(
      process.execPath,
      ['-r', registerPath, 'app.js'],
      {
        cwd: tempDir,
        env: {
          ...process.env,
          EVENTSLOG_ENDPOINT: `http://127.0.0.1:${serverPort}/v1/events`,
          EVENTSLOG_API_KEY: 'el_live_integration_key',
        },
      }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    const exitCode = await new Promise<number>((resolve) => {
      child.on('close', resolve);
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('App execution finished: sum=30 prod=12');

    // Wait slightly to ensure server completed receiving the batched payload
    await new Promise((r) => setTimeout(r, 100));

    expect(receivedBatches.length).toBeGreaterThanOrEqual(1);

    const allEvents = receivedBatches.flatMap((b) => b.events);
    expect(allEvents.length).toBeGreaterThanOrEqual(2);

    const addEvent = allEvents.find(
      (e) =>
        e.payload.type === 'function_execution' &&
        e.payload.data.function.function_name === 'add'
    );
    expect(addEvent).toBeDefined();
    if (addEvent && addEvent.payload.type === 'function_execution') {
      expect(addEvent.payload.data.function.class_name).toBe('Calculator');
      expect(addEvent.payload.data.status).toBe('success');
      expect(addEvent.payload.data.output_payload).toBe(30);
    }

    const multiplyEvent = allEvents.find(
      (e) =>
        e.payload.type === 'function_execution' &&
        e.payload.data.function.function_name === 'multiply'
    );
    expect(multiplyEvent).toBeDefined();
    if (multiplyEvent && multiplyEvent.payload.type === 'function_execution') {
      expect(multiplyEvent.payload.data.output_payload).toBe(12);
    }
  });
});
