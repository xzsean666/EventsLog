import { describe, it, expect } from 'vitest';
import { transformDartSource } from '../src/transformer/rewriter.js';
import { parseDartSource, parseParameters } from '../src/transformer/parser.js';
import { PatternMatcher } from '../src/matcher/matcher.js';
import { ResolvedEventsLogConfig } from '../src/config/loader.js';

const mockConfig: ResolvedEventsLogConfig = {
  serviceName: 'test-app',
  environment: 'test',
  endpoint: 'http://localhost:8080',
  include: ['lib/**'],
  exclude: [],
  captureArguments: true,
  captureReturns: true,
  batchSize: 100,
  flushIntervalMs: 500,
  maxQueueSize: 1000,
  importPath: 'package:eventslog_flutter/eventslog.dart',
  projectRoot: '/test',
};

describe('AST Parser & Transformer', () => {
  it('parses parameters correctly', () => {
    const p1 = parseParameters('(String userId, double amount)');
    expect(p1).toEqual([
      { name: 'userId', type: 'String' },
      { name: 'amount', type: 'double' },
    ]);

    const p2 = parseParameters('({required String id, int? count = 1})');
    expect(p2).toEqual([
      { name: 'id', type: 'String' },
      { name: 'count', type: 'int?' },
    ]);
  });

  it('detects functions in Dart class', () => {
    const source = `
class OrderService {
  Future<Order> createOrder(String userId, double amount) async {
    return await api.submit(userId, amount);
  }

  int calculateTax(int price) {
    return (price * 0.1).round();
  }

  double getRate() => 1.25;
}
`;
    const fns = parseDartSource(source);
    expect(fns.length).toBe(3);
    expect(fns[0].name).toBe('createOrder');
    expect(fns[0].isAsync).toBe(true);
    expect(fns[0].isArrow).toBe(false);

    expect(fns[1].name).toBe('calculateTax');
    expect(fns[1].isAsync).toBe(false);
    expect(fns[1].isArrow).toBe(false);

    expect(fns[2].name).toBe('getRate');
    expect(fns[2].isArrow).toBe(true);
  });

  it('transforms async and sync class methods', () => {
    const source = `
class OrderService {
  Future<Order> createOrder(String userId, double amount) async {
    final res = await api.submit(userId, amount);
    return res;
  }
}
`;
    const matcher = new PatternMatcher(['lib/**'], []);
    const result = transformDartSource(source, 'lib/services/order.dart', mockConfig, matcher);

    expect(result.modified).toBe(true);
    expect(result.instrumentedFunctions).toEqual([
      { name: 'createOrder', className: 'OrderService' },
    ]);
    expect(result.code).toContain("// @eventslog:instrumented");
    expect(result.code).toContain("import 'package:eventslog_flutter/eventslog.dart';");
    expect(result.code).toContain("EventsLog.runWithSpan(");
    expect(result.code).toContain("functionName: 'OrderService.createOrder'");
    expect(result.code).toContain("'userId': userId, 'amount': amount");
    expect(result.code).toContain("final res = await api.submit(userId, amount);");
  });

  it('transforms arrow expression function', () => {
    const source = `
class Calculator {
  int add(int a, int b) => a + b;
}
`;
    const matcher = new PatternMatcher(['lib/**'], []);
    const result = transformDartSource(source, 'lib/calc.dart', mockConfig, matcher);

    expect(result.modified).toBe(true);
    expect(result.code).toContain("functionName: 'Calculator.add'");
    expect(result.code).toContain("body: () => a + b");
    expect(result.code).toContain("'a': a, 'b': b");
  });

  it('is idempotent and does not re-instrument already tagged code', () => {
    const source = `
// @eventslog:instrumented
import 'package:eventslog_flutter/eventslog.dart';

class OrderService {
  Future<Order> createOrder() async {}
}
`;
    const matcher = new PatternMatcher(['lib/**'], []);
    const result = transformDartSource(source, 'lib/services/order.dart', mockConfig, matcher);

    expect(result.modified).toBe(false);
    expect(result.code).toBe(source);
    expect(result.instrumentedFunctions.length).toBe(0);
  });

  it('correctly handles Future<void> async, void async, and sync void functions', () => {
    const source = `
class AsyncService {
  Future<void> saveUser(String id) async {
    await db.save(id);
  }

  void fireAndForget(String id) async {
    await notify(id);
  }

  void syncLog(String msg) {
    print(msg);
  }
}
`;
    const matcher = new PatternMatcher(['lib/**'], []);
    const result = transformDartSource(source, 'lib/async.dart', mockConfig, matcher);

    expect(result.modified).toBe(true);
    // Future<void> async must RETURN the span future
    expect(result.code).toContain("return EventsLog.runWithSpan(\n      functionName: 'AsyncService.saveUser'");
    // void async must AWAIT the span future
    expect(result.code).toContain("await EventsLog.runWithSpan(\n      functionName: 'AsyncService.fireAndForget'");
    // void sync must NOT have return or await
    expect(result.code).toMatch(/syncLog\([^)]*\)\s*\{\s*EventsLog\.runWithSpan/);
  });

  it('correctly parses generic return types', () => {
    const source = `
class Repo {
  Future<Map<String, dynamic>> fetchJson() async => {};
  Future<void> flush() async {}
  List<String>? getItems() => null;
}
`;
    const fns = parseDartSource(source);
    expect(fns.length).toBe(3);
    expect(fns[0].returnType).toBe('Future<Map<String, dynamic>>');
    expect(fns[1].returnType).toBe('Future<void>');
    expect(fns[2].returnType).toBe('List<String>?');
  });
});
