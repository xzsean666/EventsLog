import { describe, it, expect } from 'vitest';
import { BrowserSanitizer, REDACTED_STRING } from '../src/sanitization/sanitizer';

describe('Browser Data Sanitizer', () => {
  it('redacts sensitive keys based on default patterns', () => {
    const sanitizer = new BrowserSanitizer();
    const input = {
      username: 'alice',
      password: 'super-secret-password',
      token: 'some-auth-token',
      api_key: 'key-12345',
      user: {
        credit_card: '4111-2222-3333-4444',
      },
    };

    const sanitized = sanitizer.sanitize(input) as Record<string, unknown>;
    expect(sanitized.username).toBe('alice');
    expect(sanitized.password).toBe(REDACTED_STRING);
    expect(sanitized.token).toBe(REDACTED_STRING);
    expect(sanitized.api_key).toBe(REDACTED_STRING);
    expect((sanitized.user as Record<string, unknown>).credit_card).toBe(REDACTED_STRING);
  });

  it('redacts sensitive values such as JWTs and Bearer tokens in positional arrays', () => {
    const sanitizer = new BrowserSanitizer();
    const input = [
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      '4111 2222 3333 4444',
      'normal-argument',
    ];

    const sanitized = sanitizer.sanitize(input) as unknown[];
    expect(sanitized[0]).toBe(REDACTED_STRING);
    expect(sanitized[1]).toBe(REDACTED_STRING);
    expect(sanitized[2]).toBe('normal-argument');
  });

  it('handles circular references gracefully without crashing', () => {
    const sanitizer = new BrowserSanitizer();
    const circular: Record<string, unknown> = { name: 'self' };
    circular.loop = circular;

    const sanitized = sanitizer.sanitize(circular) as Record<string, unknown>;
    expect(sanitized.name).toBe('self');
    expect(sanitized.loop).toBe('[CIRCULAR_REFERENCE]');
  });

  it('clamps recursive traversal to maximum depth', () => {
    const sanitizer = new BrowserSanitizer({ maxDepth: 2 });
    const deepObj = {
      level1: {
        level2: {
          level3: 'too deep',
        },
      },
    };

    const sanitized = sanitizer.sanitize(deepObj) as Record<string, unknown>;
    const level1 = sanitized.level1 as Record<string, unknown>;
    const level2 = level1.level2 as Record<string, unknown>;
    expect(level2).toBe('[MAX_DEPTH_REACHED]');
  });

  it('truncates oversized payloads exceeding maxPayloadBytes', () => {
    const sanitizer = new BrowserSanitizer({ maxPayloadBytes: 200 });
    const hugeString = 'A'.repeat(500);

    const sanitized = sanitizer.sanitize({ big: hugeString }) as Record<string, unknown>;
    expect(sanitized._truncated).toBe(true);
    expect(typeof sanitized.preview).toBe('string');
  });

  it('safely handles throwing property getters without throwing', () => {
    const sanitizer = new BrowserSanitizer();
    const problematic: Record<string, unknown> = {
      safeProp: 'ok',
    };
    Object.defineProperty(problematic, 'evilGetter', {
      get() {
        throw new Error('Access denied');
      },
      enumerable: true,
    });

    const sanitized = sanitizer.sanitize(problematic) as Record<string, unknown>;
    expect(sanitized.safeProp).toBe('ok');
    expect(sanitized.evilGetter).toBe('[Inaccessible Property]');
  });
});
