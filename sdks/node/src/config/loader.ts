import * as fs from 'node:fs';
import * as path from 'node:path';
import * as YAML from 'yaml';
import {
  type EventsLogConfig,
  type BatchingConfig,
  type InstrumentationConfig,
  DEFAULT_CONFIG,
  DEFAULT_BATCHING_CONFIG,
  DEFAULT_INSTRUMENTATION_CONFIG,
} from './types.js';

/**
 * Searches for an EventsLog configuration file in the specified directory.
 */
export function findConfigFile(startDir: string = process.cwd()): string | null {
  const envFile = process.env.EVENTSLOG_CONFIG_FILE;
  if (envFile && fs.existsSync(envFile)) {
    return path.resolve(envFile);
  }

  const searchRoots: string[] = [startDir];
  if (process.argv && process.argv[1]) {
    try {
      const scriptDir = path.dirname(path.resolve(process.argv[1]));
      if (!searchRoots.includes(scriptDir)) {
        searchRoots.push(scriptDir);
      }
    } catch {
      // ignore
    }
  }

  const candidates = ['eventslog.yaml', 'eventslog.yml', 'eventslog.json'];

  for (const root of searchRoots) {
    let currentDir = root;
    while (currentDir) {
      for (const filename of candidates) {
        const fullPath = path.join(currentDir, filename);
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }
      const parent = path.dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
    }
  }

  return null;
}

/**
 * Parses raw file content as JSON or YAML based on file extension or fallback.
 */
export function parseConfigFile(filePath: string): Partial<EventsLogConfig> {
  const content = fs.readFileSync(filePath, 'utf-8');
  if (filePath.endsWith('.json')) {
    return JSON.parse(content) as Partial<EventsLogConfig>;
  }
  return YAML.parse(content) as Partial<EventsLogConfig>;
}

/**
 * Loads environment variable overrides for EventsLog configuration.
 */
export function loadEnvConfig(): Partial<EventsLogConfig> {
  const envConfig: Partial<EventsLogConfig> = {};
  const batching: Partial<BatchingConfig> = {};
  const instrumentation: Partial<InstrumentationConfig> = {};

  if (process.env.EVENTSLOG_ENDPOINT) {
    envConfig.endpoint = process.env.EVENTSLOG_ENDPOINT;
  }
  if (process.env.EVENTSLOG_API_KEY) {
    envConfig.api_key = process.env.EVENTSLOG_API_KEY;
  }
  if (process.env.EVENTSLOG_SERVICE_NAME) {
    envConfig.service_name = process.env.EVENTSLOG_SERVICE_NAME;
  }
  if (process.env.EVENTSLOG_ENVIRONMENT) {
    envConfig.environment = process.env.EVENTSLOG_ENVIRONMENT;
  }

  if (process.env.EVENTSLOG_MAX_BATCH_SIZE) {
    const val = parseInt(process.env.EVENTSLOG_MAX_BATCH_SIZE, 10);
    if (!isNaN(val) && val > 0) batching.max_batch_size = val;
  }
  if (process.env.EVENTSLOG_FLUSH_INTERVAL_MS) {
    const val = parseInt(process.env.EVENTSLOG_FLUSH_INTERVAL_MS, 10);
    if (!isNaN(val) && val > 0) batching.flush_interval_ms = val;
  }
  if (process.env.EVENTSLOG_MAX_QUEUE_SIZE) {
    const val = parseInt(process.env.EVENTSLOG_MAX_QUEUE_SIZE, 10);
    if (!isNaN(val) && val > 0) batching.max_queue_size = val;
  }

  if (process.env.EVENTSLOG_SAMPLING_RATE) {
    const val = parseFloat(process.env.EVENTSLOG_SAMPLING_RATE);
    if (!isNaN(val) && val >= 0 && val <= 1) instrumentation.sampling_rate = val;
  }

  if (Object.keys(batching).length > 0) {
    envConfig.batching = batching as BatchingConfig;
  }
  if (Object.keys(instrumentation).length > 0) {
    envConfig.instrumentation = instrumentation as InstrumentationConfig;
  }

  return envConfig;
}

/**
 * Merges default settings, file configuration, environment variables, and explicit options.
 */
export function loadConfig(
  explicitOptions: Partial<EventsLogConfig> = {},
  searchDir: string = process.cwd()
): EventsLogConfig {
  let fileConfig: Partial<EventsLogConfig> = {};
  const discoveredFile = findConfigFile(searchDir);

  if (discoveredFile) {
    try {
      fileConfig = parseConfigFile(discoveredFile);
    } catch (err) {
      // Continue with defaults and log warning if file was unparseable
      console.warn(`[EventsLog] Failed to parse config file at ${discoveredFile}:`, err);
    }
  }

  const envConfig = loadEnvConfig();

  const batching: BatchingConfig = {
    ...DEFAULT_BATCHING_CONFIG,
    ...(fileConfig.batching ?? {}),
    ...(envConfig.batching ?? {}),
    ...(explicitOptions.batching ?? {}),
  };

  const instrumentation: InstrumentationConfig = {
    ...DEFAULT_INSTRUMENTATION_CONFIG,
    ...(fileConfig.instrumentation ?? {}),
    ...(envConfig.instrumentation ?? {}),
    ...(explicitOptions.instrumentation ?? {}),
  };

  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...envConfig,
    ...explicitOptions,
    batching,
    instrumentation,
  };
}
