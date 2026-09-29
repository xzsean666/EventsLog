import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  PatternMatcher,
  globToRegex,
  loadConfig,
  DEFAULT_CONFIG,
  DEFAULT_BATCHING_CONFIG,
} from '../src/index.js';

describe('PatternMatcher & Glob Evaluation', () => {
  it('should compile simple wildcard patterns to regex', () => {
    const re = globToRegex('OrderService.*');
    expect(re.test('OrderService.checkout')).toBe(true);
    expect(re.test('OrderService.refund')).toBe(true);
    expect(re.test('PaymentService.create')).toBe(false);
  });

  it('should compile path glob patterns with single star and double star', () => {
    const singleStar = globToRegex('src/services/*.ts');
    expect(singleStar.test('src/services/order.ts')).toBe(true);
    expect(singleStar.test('src/services/sub/order.ts')).toBe(false);

    const doubleStar = globToRegex('src/services/**/*.ts');
    expect(doubleStar.test('src/services/order.ts')).toBe(true);
    expect(doubleStar.test('src/services/sub/deep/order.ts')).toBe(true);
    expect(doubleStar.test('src/other/order.ts')).toBe(false);
  });

  it('should respect exclude priority over include', () => {
    const matcher = new PatternMatcher({
      include: ['OrderService.*', 'PaymentService.create'],
      exclude: ['*.toJSON', 'OrderService.internal*'],
    });

    expect(matcher.matches('OrderService.checkout')).toBe(true);
    expect(matcher.matches('PaymentService.create')).toBe(true);
    expect(matcher.matches('OrderService.toJSON')).toBe(false);
    expect(matcher.matches('OrderService.internalDebug')).toBe(false);
    expect(matcher.matches('OtherService.run')).toBe(false);
  });

  it('should return false if include list is empty', () => {
    const matcher = new PatternMatcher({
      include: [],
      exclude: ['Secret.*'],
    });
    expect(matcher.matches('AnyFunction')).toBe(false);
  });

  it('should evaluate isObserved across module, function, and class candidates', () => {
    const matcher = new PatternMatcher({
      include: ['UserService.*', 'services/billing:*'],
      exclude: ['UserService.hashPassword'],
    });

    expect(matcher.isObserved('services/user', 'findUser', 'UserService')).toBe(true);
    expect(matcher.isObserved('services/user', 'hashPassword', 'UserService')).toBe(false);
    expect(matcher.isObserved('services/billing', 'chargeInvoice')).toBe(true);
    expect(matcher.isObserved('services/auth', 'login')).toBe(false);
  });
});

describe('Configuration Loader', () => {
  let tempDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventslog-cfg-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it('should return default configuration when no file or env vars are set', () => {
    const config = loadConfig({}, tempDir);
    expect(config.endpoint).toBe('http://127.0.0.1:8080/v1/events');
    expect(config.batching.max_batch_size).toBe(DEFAULT_BATCHING_CONFIG.max_batch_size);
    expect(config.batching.flush_interval_ms).toBe(DEFAULT_BATCHING_CONFIG.flush_interval_ms);
    expect(config.batching.max_queue_size).toBe(DEFAULT_BATCHING_CONFIG.max_queue_size);
    expect(config.instrumentation.sampling_rate).toBe(1.0);
  });

  it('should load configuration from eventslog.json', () => {
    const jsonPath = path.join(tempDir, 'eventslog.json');
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({
        service_name: 'json-microservice',
        environment: 'staging',
        batching: {
          max_batch_size: 50,
          flush_interval_ms: 250,
        },
      })
    );

    const config = loadConfig({}, tempDir);
    expect(config.service_name).toBe('json-microservice');
    expect(config.environment).toBe('staging');
    expect(config.batching.max_batch_size).toBe(50);
    expect(config.batching.flush_interval_ms).toBe(250);
    expect(config.batching.max_queue_size).toBe(5000);
  });

  it('should load configuration from eventslog.yaml', () => {
    const yamlPath = path.join(tempDir, 'eventslog.yaml');
    fs.writeFileSync(
      yamlPath,
      `
service_name: yaml-microservice
batching:
  max_batch_size: 200
  flush_interval_ms: 1000
instrumentation:
  include:
    - "OrderService.*"
  exclude:
    - "*.privateMethod"
  sampling_rate: 0.8
`
    );

    const config = loadConfig({}, tempDir);
    expect(config.service_name).toBe('yaml-microservice');
    expect(config.batching.max_batch_size).toBe(200);
    expect(config.batching.flush_interval_ms).toBe(1000);
    expect(config.instrumentation.include).toEqual(['OrderService.*']);
    expect(config.instrumentation.exclude).toEqual(['*.privateMethod']);
    expect(config.instrumentation.sampling_rate).toBe(0.8);
  });

  it('should allow environment variables to override file config', () => {
    process.env.EVENTSLOG_SERVICE_NAME = 'env-override-service';
    process.env.EVENTSLOG_MAX_BATCH_SIZE = '300';
    process.env.EVENTSLOG_FLUSH_INTERVAL_MS = '150';

    const config = loadConfig({}, tempDir);
    expect(config.service_name).toBe('env-override-service');
    expect(config.batching.max_batch_size).toBe(300);
    expect(config.batching.flush_interval_ms).toBe(150);
  });

  it('should allow explicit programmatic options to take highest precedence', () => {
    process.env.EVENTSLOG_SERVICE_NAME = 'env-service';
    const config = loadConfig(
      {
        service_name: 'explicit-service',
        batching: {
          max_batch_size: 999,
          flush_interval_ms: 10,
          max_queue_size: 10000,
        },
      },
      tempDir
    );

    expect(config.service_name).toBe('explicit-service');
    expect(config.batching.max_batch_size).toBe(999);
  });
});
