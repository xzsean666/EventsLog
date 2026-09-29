import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfig } from '../src/config/loader.js';

describe('Config Loader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventslog-flutter-config-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('provides sensible defaults when no eventslog.yaml exists', () => {
    const config = loadConfig(tmpDir);
    expect(config.serviceName).toBe('flutter-app');
    expect(config.environment).toBe('production');
    expect(config.endpoint).toBe('http://localhost:8080/v1/events/batch');
    expect(config.batchSize).toBe(100);
    expect(config.flushIntervalMs).toBe(500);
    expect(config.captureArguments).toBe(true);
    expect(config.captureReturns).toBe(true);
    expect(config.importPath).toBe('package:eventslog_flutter/eventslog.dart');
  });

  it('infers service_name from pubspec.yaml if present', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'pubspec.yaml'),
      'name: my_awesome_flutter_app\nversion: 1.0.0\n',
      'utf8',
    );
    const config = loadConfig(tmpDir);
    expect(config.serviceName).toBe('my_awesome_flutter_app');
  });

  it('parses custom eventslog.yaml properly', () => {
    const yamlContent = `
eventslog:
  service_name: "custom-checkout-app"
  environment: "staging"
  endpoint: "https://ingest.mycompany.internal/v1/events"
  batch_size: 50
  flush_interval_ms: 200
  max_queue_size: 5000
  capture_arguments: false
  capture_returns: true
  include:
    - "lib/services/**"
  exclude:
    - "*_mock.dart"
`;
    fs.writeFileSync(path.join(tmpDir, 'eventslog.yaml'), yamlContent, 'utf8');

    const config = loadConfig(tmpDir);
    expect(config.serviceName).toBe('custom-checkout-app');
    expect(config.environment).toBe('staging');
    expect(config.endpoint).toBe('https://ingest.mycompany.internal/v1/events');
    expect(config.batchSize).toBe(50);
    expect(config.flushIntervalMs).toBe(200);
    expect(config.maxQueueSize).toBe(5000);
    expect(config.captureArguments).toBe(false);
    expect(config.captureReturns).toBe(true);
    expect(config.include).toEqual(['lib/services/**']);
    expect(config.exclude).toContain('*_mock.dart');
  });
});
