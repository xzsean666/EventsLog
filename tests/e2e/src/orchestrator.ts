import { spawn, ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

export interface ServiceOptions {
  ingestionPort: number;
  queryPort: number;
  clickhouseUrl: string;
  apiKey: string;
}

export interface OrchestrationResult {
  ingestionProcess: ChildProcess;
  queryProcess: ChildProcess;
  ingestionUrl: string;
  queryUrl: string;
  stop: () => Promise<void>;
}

async function waitForHttpOk(url: string, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return;
      }
    } catch {
      // Retry after delay
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Service at ${url} failed to respond within ${timeoutMs}ms`);
}

export async function launchServices(options: ServiceOptions): Promise<OrchestrationResult> {
  const rootDir = path.resolve(__dirname, '../../..');
  const ingestionBin = path.join(rootDir, 'target/debug/eventslog-ingestion');
  const queryBin = path.join(rootDir, 'target/debug/eventslog-query');

  if (!fs.existsSync(ingestionBin)) {
    throw new Error(`Ingestion binary not found at ${ingestionBin}. Run cargo build first.`);
  }
  if (!fs.existsSync(queryBin)) {
    throw new Error(`Query binary not found at ${queryBin}. Run cargo build first.`);
  }

  // 1. Launch Ingestion Service
  const ingestionEnv = {
    ...process.env,
    EVENTSLOG_HOST: '127.0.0.1',
    EVENTSLOG_PORT: String(options.ingestionPort),
    EVENTSLOG_CLICKHOUSE_URL: options.clickhouseUrl,
    EVENTSLOG_API_KEY: options.apiKey,
    EVENTSLOG_FLUSH_INTERVAL_MS: '50',
    EVENTSLOG_BUFFER_SIZE: '10000',
    RUST_LOG: 'info',
  };

  const ingestionProcess = spawn(ingestionBin, [], {
    env: ingestionEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  ingestionProcess.stdout?.on('data', (d) => {
    process.stdout.write(`[INGEST] ${d}`);
  });
  ingestionProcess.stderr?.on('data', (d) => {
    process.stderr.write(`[INGEST ERR] ${d}`);
  });

  // 2. Launch Query Service
  const queryEnv = {
    ...process.env,
    EVENTSLOG_HOST: '127.0.0.1',
    EVENTSLOG_PORT: String(options.queryPort),
    EVENTSLOG_CLICKHOUSE_URL: options.clickhouseUrl,
    EVENTSLOG_API_KEY: options.apiKey,
    RUST_LOG: 'info',
  };

  const queryProcess = spawn(queryBin, [], {
    env: queryEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  queryProcess.stdout?.on('data', (d) => {
    process.stdout.write(`[QUERY] ${d}`);
  });
  queryProcess.stderr?.on('data', (d) => {
    process.stderr.write(`[QUERY ERR] ${d}`);
  });

  const ingestionUrl = `http://127.0.0.1:${options.ingestionPort}`;
  const queryUrl = `http://127.0.0.1:${options.queryPort}`;

  try {
    // Wait for both services to be healthy
    await Promise.all([
      waitForHttpOk(`${ingestionUrl}/health`),
      waitForHttpOk(`${queryUrl}/health`),
    ]);
  } catch (err) {
    ingestionProcess.kill();
    queryProcess.kill();
    throw err;
  }

  const stop = async () => {
    const killChild = (child: ChildProcess) => {
      return new Promise<void>((resolve) => {
        if (!child || child.killed || child.exitCode !== null) {
          resolve();
          return;
        }
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
          resolve();
        }, 1500);
      });
    };

    await Promise.all([killChild(ingestionProcess), killChild(queryProcess)]);
  };

  return {
    ingestionProcess,
    queryProcess,
    ingestionUrl,
    queryUrl,
    stop,
  };
}
