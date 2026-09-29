import { describe, it, expect } from 'vitest';
import {
  sanitizeValue,
  limitPayloadSize,
  capturePayload,
  isSensitiveKey,
} from '../src/index.js';

describe('Sanitizer & Sensitive Field Masking', () => {
  it('should identify sensitive keys with case and punctuation variation', () => {
    const keys = ['password', 'api_key'];
    expect(isSensitiveKey('password', keys)).toBe(true);
    expect(isSensitiveKey('PASSWORD', keys)).toBe(true);
    expect(isSensitiveKey('userPassword', keys)).toBe(true);
    expect(isSensitiveKey('apiKey', keys)).toBe(true);
    expect(isSensitiveKey('API_KEY', keys)).toBe(true);
    expect(isSensitiveKey('accessToken', keys)).toBe(false);
  });

  it('should redact sensitive keys in nested object structures', () => {
    const input = {
      username: 'john_doe',
      password: 'supersecretpassword123',
      nested: {
        apiKey: 'el_live_1234567890',
        metadata: {
          token: 'jwt.token.here',
          normalField: 42,
        },
      },
    };

    const sanitized = sanitizeValue(input) as Record<string, any>;
    expect(sanitized.username).toBe('john_doe');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.nested.apiKey).toBe('[REDACTED]');
    expect(sanitized.nested.metadata.token).toBe('[REDACTED]');
    expect(sanitized.nested.metadata.normalField).toBe(42);
  });

  it('should handle circular references safely without throwing', () => {
    const objA: any = { name: 'A' };
    const objB: any = { name: 'B', parent: objA };
    objA.child = objB; // Circular link

    const sanitized = sanitizeValue(objA) as any;
    expect(sanitized.name).toBe('A');
    expect(sanitized.child.name).toBe('B');
    expect(sanitized.child.parent).toBe('[CIRCULAR]');
  });

  it('should safely serialize non-standard JavaScript data types', () => {
    const fn = function calculateTotal() {};
    const sym = Symbol('custom_sym');
    const buf = Buffer.from('hello eventslog');
    const date = new Date('2026-01-01T00:00:00.000Z');
    const err = new Error('Database connection dropped');

    const input = {
      bigIntValue: 900719925474099999n,
      symbolValue: sym,
      funcValue: fn,
      bufferValue: buf,
      dateValue: date,
      errorValue: err,
    };

    const sanitized = sanitizeValue(input) as any;
    expect(sanitized.bigIntValue).toBe('900719925474099999');
    expect(sanitized.symbolValue).toContain('Symbol(custom_sym)');
    expect(sanitized.funcValue).toBe('[Function: calculateTotal]');
    expect(sanitized.bufferValue).toBe(`[Buffer: ${buf.length} bytes]`);
    expect(sanitized.dateValue).toBe('2026-01-01T00:00:00.000Z');
    expect(sanitized.errorValue.name).toBe('Error');
    expect(sanitized.errorValue.message).toBe('Database connection dropped');
  });

  it('should enforce depth and string length limits', () => {
    const longString = 'a'.repeat(2000);
    const deepObject: any = { l1: { l2: { l3: { l4: { l5: { l6: { l7: 'deep' } } } } } } };

    const sanitized = sanitizeValue(
      { text: longString, hierarchy: deepObject },
      { maxDepth: 4, maxStringLength: 100 }
    ) as any;

    expect(sanitized.text).toContain('...[TRUNCATED 1900 chars]');
    expect(sanitized.hierarchy.l1.l2.l3.l4).toBe('[MAX_DEPTH_EXCEEDED]');
  });
});

describe('Payload Limiter & Byte Size Truncation', () => {
  it('should pass through payloads smaller than byte threshold', () => {
    const payload = { id: 123, status: 'ok' };
    const result = limitPayloadSize(payload, 1024);
    expect(result).toEqual(payload);
  });

  it('should return truncation notice when payload exceeds byte threshold', () => {
    const largeObject = {
      data: 'x'.repeat(1000),
    };

    const result = limitPayloadSize(largeObject, 500) as any;
    expect(result._truncated).toBe(true);
    expect(result._max_byte_length).toBe(500);
    expect(result._original_byte_length).toBeGreaterThan(1000);
    expect(result._message).toContain('Payload exceeded maximum allowed limit');
  });

  it('should perform sanitization and size limitation in capturePayload', () => {
    const input = {
      apiKey: 'secret_key_12345',
      content: 'clean data',
    };

    const result = capturePayload(input, undefined, 1024) as any;
    expect(result.apiKey).toBe('[REDACTED]');
    expect(result.content).toBe('clean data');
  });
});
