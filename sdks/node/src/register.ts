import { loadConfig } from './config/loader.js';
import { HttpTransport } from './transport/http.js';
import { EventBatcher } from './batching/batcher.js';
import { installModuleHook } from './loader/interceptor.js';
import { installConsoleHook } from './logging/console.js';
import type { EventsLogConfig } from './config/types.js';

export interface SdkInstance {
  config: EventsLogConfig;
  batcher: EventBatcher;
  transport: HttpTransport;
  flush: () => Promise<void>;
  shutdown: () => Promise<void>;
}

declare global {
  // eslint-disable-next-line no-var
  var __EVENTSLOG_SDK__: SdkInstance | undefined;
}

/**
 * Initializes the zero-code observability SDK.
 */
export function register(): SdkInstance {
  if (globalThis.__EVENTSLOG_SDK__) {
    return globalThis.__EVENTSLOG_SDK__;
  }

  const config = loadConfig();
  const transport = new HttpTransport({
    endpoint: config.endpoint,
    apiKey: config.api_key,
  });

  const batcher = new EventBatcher({
    maxBatchSize: config.batching.max_batch_size,
    flushIntervalMs: config.batching.flush_interval_ms,
    maxQueueSize: config.batching.max_queue_size,
    transport,
  });

  // Install module interceptor hook
  installModuleHook(config, (event) => {
    batcher.push(event);
  });

  // Install non-intrusive console telemetry hook
  installConsoleHook(config, (event) => {
    batcher.push(event);
  });

  // Attach lifecycle flush handlers
  let isFlushing = false;
  const gracefulFlush = async (timeoutMs = 1500) => {
    if (isFlushing) return;
    isFlushing = true;
    try {
      await Promise.race([
        batcher.flush(),
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    } catch (err) {
      console.warn('[EventsLog] Failed to flush events on process termination:', err);
    }
  };

  process.on('beforeExit', async () => {
    await gracefulFlush();
  });

  process.once('SIGINT', async () => {
    await gracefulFlush();
    process.exit(130);
  });

  process.once('SIGTERM', async () => {
    await gracefulFlush();
    process.exit(143);
  });

  const instance: SdkInstance = {
    config,
    batcher,
    transport,
    flush: () => batcher.flush(),
    shutdown: () => batcher.shutdown(),
  };

  globalThis.__EVENTSLOG_SDK__ = instance;
  return instance;
}

// Auto-register upon import / require
register();
