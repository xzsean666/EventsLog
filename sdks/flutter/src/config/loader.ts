import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';

export interface EventsLogFileConfig {
  service_name?: string;
  environment?: string;
  endpoint?: string;
  include?: string[];
  exclude?: string[];
  capture_arguments?: boolean;
  capture_returns?: boolean;
  batch_size?: number;
  flush_interval_ms?: number;
  max_queue_size?: number;
  import_path?: string;
  headers?: Record<string, string>;
}

export interface EventsLogRootConfig {
  eventslog?: EventsLogFileConfig;
}

export interface ResolvedEventsLogConfig {
  serviceName: string;
  environment: string;
  endpoint: string;
  include: string[];
  exclude: string[];
  captureArguments: boolean;
  captureReturns: boolean;
  batchSize: number;
  flushIntervalMs: number;
  maxQueueSize: number;
  importPath: string;
  headers?: Record<string, string>;
  projectRoot: string;
  configPath?: string;
}

const DEFAULT_CONFIG: Omit<ResolvedEventsLogConfig, 'projectRoot'> = {
  serviceName: 'flutter-app',
  environment: 'production',
  endpoint: 'http://localhost:8080/v1/events/batch',
  include: ['lib/**/*.dart'],
  exclude: [
    '**/*_test.dart',
    '**/*.g.dart',
    '**/*.freezed.dart',
    '**/*.config.dart',
    '**/generated/**',
    '**/.eventslog_backup/**',
  ],
  captureArguments: true,
  captureReturns: true,
  batchSize: 100,
  flushIntervalMs: 500,
  maxQueueSize: 1000,
  importPath: 'package:eventslog_flutter/eventslog.dart',
};

/**
 * Searches upwards from [startDir] to locate the project root (containing pubspec.yaml).
 */
export function findProjectRoot(startDir: string = process.cwd()): string {
  let curr = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(curr, 'pubspec.yaml'))) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) {
      break;
    }
    curr = parent;
  }
  return path.resolve(startDir);
}

/**
 * Attempts to extract the package name from pubspec.yaml.
 */
function readPubspecName(projectRoot: string): string | undefined {
  const pubspecPath = path.join(projectRoot, 'pubspec.yaml');
  if (!fs.existsSync(pubspecPath)) return undefined;

  try {
    const content = fs.readFileSync(pubspecPath, 'utf8');
    const parsed = parseYaml(content) as { name?: string };
    return parsed?.name;
  } catch {
    return undefined;
  }
}

/**
 * Finds and loads the `eventslog.yaml` configuration file.
 */
export function loadConfig(projectRoot?: string, explicitConfigPath?: string): ResolvedEventsLogConfig {
  const root = projectRoot ? path.resolve(projectRoot) : findProjectRoot();

  const candidateNames = [
    'eventslog.yaml',
    'eventslog.yml',
    'eventslog.config.yaml',
    'eventslog.config.yml',
    'eventslog.json',
  ];

  let foundConfigPath: string | undefined = explicitConfigPath
    ? path.resolve(root, explicitConfigPath)
    : undefined;

  if (!foundConfigPath) {
    for (const name of candidateNames) {
      const p = path.join(root, name);
      if (fs.existsSync(p)) {
        foundConfigPath = p;
        break;
      }
    }
  }

  let userConfig: EventsLogFileConfig = {};

  if (foundConfigPath && fs.existsSync(foundConfigPath)) {
    const raw = fs.readFileSync(foundConfigPath, 'utf8');
    if (foundConfigPath.endsWith('.json')) {
      const parsed = JSON.parse(raw);
      userConfig = parsed.eventslog || parsed;
    } else {
      const parsed = parseYaml(raw) as EventsLogRootConfig | EventsLogFileConfig;
      userConfig = (parsed && 'eventslog' in parsed && parsed.eventslog) ? parsed.eventslog : (parsed as EventsLogFileConfig) || {};
    }
  }

  const pubspecName = readPubspecName(root);

  return {
    serviceName: userConfig.service_name || pubspecName || DEFAULT_CONFIG.serviceName,
    environment: userConfig.environment || DEFAULT_CONFIG.environment,
    endpoint: userConfig.endpoint || DEFAULT_CONFIG.endpoint,
    include: userConfig.include && userConfig.include.length > 0 ? userConfig.include : DEFAULT_CONFIG.include,
    exclude: [...DEFAULT_CONFIG.exclude, ...(userConfig.exclude || [])],
    captureArguments: userConfig.capture_arguments ?? DEFAULT_CONFIG.captureArguments,
    captureReturns: userConfig.capture_returns ?? DEFAULT_CONFIG.captureReturns,
    batchSize: userConfig.batch_size ?? DEFAULT_CONFIG.batchSize,
    flushIntervalMs: userConfig.flush_interval_ms ?? DEFAULT_CONFIG.flushIntervalMs,
    maxQueueSize: userConfig.max_queue_size ?? DEFAULT_CONFIG.maxQueueSize,
    importPath: userConfig.import_path || DEFAULT_CONFIG.importPath,
    headers: userConfig.headers,
    projectRoot: root,
    configPath: foundConfigPath,
  };
}
