import { describe, it, expect } from 'vitest';
import { PatternMatcher, globToRegex } from '../src/matcher/matcher.js';

describe('Pattern Matcher', () => {
  it('converts glob patterns to regex correctly', () => {
    const r1 = globToRegex('lib/services/**');
    expect(r1.test('lib/services/order_service.dart')).toBe(true);
    expect(r1.test('lib/services/sub/payment.dart')).toBe(true);
    expect(r1.test('lib/controllers/user.dart')).toBe(false);

    const r2 = globToRegex('*_test.dart');
    expect(r2.test('order_service_test.dart')).toBe(true);
    expect(r2.test('order_service.dart')).toBe(false);
  });

  it('matches files with include and exclude precedence', () => {
    const matcher = new PatternMatcher(
      ['lib/**/*.dart'],
      ['**/*_test.dart', '**/*.g.dart'],
    );

    expect(matcher.matchesFile('lib/services/order.dart')).toBe(true);
    expect(matcher.matchesFile('lib/services/order_test.dart')).toBe(false);
    expect(matcher.matchesFile('lib/models/order.g.dart')).toBe(false);
    expect(matcher.matchesFile('test/unit_test.dart')).toBe(false);
  });

  it('matches specific class and function rules', () => {
    const matcher = new PatternMatcher(
      ['lib/services/**', 'OrderService.*'],
      ['OrderService.secretInternalMethod'],
    );

    expect(matcher.matchesFunction('lib/services/order.dart', 'OrderService', 'createOrder')).toBe(true);
    expect(matcher.matchesFunction('lib/services/order.dart', 'OrderService', 'secretInternalMethod')).toBe(false);
  });
});
