import { DEFAULT_SENSITIVE_KEYS } from '../config/types.js';

export interface SanitizerOptions {
  /**
   * List of sensitive key names to redact.
   */
  sensitiveKeys?: string[];
  /**
   * Maximum recursion depth. Default: 6.
   */
  maxDepth?: number;
  /**
   * Maximum string length before truncation. Default: 1024.
   */
  maxStringLength?: number;
  /**
   * Maximum elements captured in arrays. Default: 100.
   */
  maxArrayLength?: number;
  /**
   * Maximum number of keys captured per object. Default: 100.
   */
  maxKeys?: number;
}

const DEFAULT_OPTIONS: Required<SanitizerOptions> = {
  sensitiveKeys: DEFAULT_SENSITIVE_KEYS,
  maxDepth: 6,
  maxStringLength: 1024,
  maxArrayLength: 100,
  maxKeys: 100,
};

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, '');
}

/**
 * Checks whether a given object key matches any of the normalized sensitive key patterns.
 */
export function isSensitiveKey(key: string, sensitiveKeys: string[]): boolean {
  const normKey = normalizeKey(key);
  for (const s of sensitiveKeys) {
    const normS = normalizeKey(s);
    if (normKey === normS || normKey.includes(normS)) {
      return true;
    }
  }
  return false;
}

/**
 * Recursively sanitizes any JavaScript value into a JSON-safe structure:
 * - Detects and breaks circular references
 * - Redacts sensitive field values with `"[REDACTED]"`
 * - Safely converts BigInt, Symbol, Function, Buffer, Error, and Date
 * - Truncates strings, arrays, and deep object graphs exceeding limits
 */
export function sanitizeValue(value: unknown, options: SanitizerOptions = {}): unknown {
  const opts: Required<SanitizerOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const seen = new WeakSet<object>();

  function walk(val: unknown, depth: number): unknown {
    if (val === null || val === undefined) {
      return val;
    }

    if (depth > opts.maxDepth) {
      return '[MAX_DEPTH_EXCEEDED]';
    }

    const valType = typeof val;

    if (valType === 'string') {
      const s = val as string;
      if (s.length > opts.maxStringLength) {
        return s.slice(0, opts.maxStringLength) + `...[TRUNCATED ${s.length - opts.maxStringLength} chars]`;
      }
      return s;
    }

    if (valType === 'number' || valType === 'boolean') {
      return val;
    }

    if (valType === 'bigint') {
      return (val as bigint).toString();
    }

    if (valType === 'symbol') {
      return (val as symbol).toString();
    }

    if (valType === 'function') {
      const fn = val as Function;
      return `[Function: ${fn.name || 'anonymous'}]`;
    }

    if (valType === 'object') {
      const obj = val as object;

      // Handle Buffer
      if (typeof Buffer !== 'undefined' && Buffer.isBuffer(obj)) {
        return `[Buffer: ${obj.length} bytes]`;
      }

      // Handle Date
      if (obj instanceof Date) {
        return isNaN(obj.getTime()) ? '[Invalid Date]' : obj.toISOString();
      }

      // Handle RegExp
      if (obj instanceof RegExp) {
        return obj.toString();
      }

      // Handle Error
      if (obj instanceof Error) {
        return {
          name: obj.name,
          message: obj.message,
          stack: obj.stack,
        };
      }

      // Circular reference detection
      if (seen.has(obj)) {
        return '[CIRCULAR]';
      }
      seen.add(obj);

      // Handle Array
      if (Array.isArray(obj)) {
        const result: unknown[] = [];
        const len = Math.min(obj.length, opts.maxArrayLength);
        for (let i = 0; i < len; i++) {
          result.push(walk(obj[i], depth + 1));
        }
        if (obj.length > opts.maxArrayLength) {
          result.push(`[... ${obj.length - opts.maxArrayLength} more items]`);
        }
        return result;
      }

      // Handle standard Object
      const result: Record<string, unknown> = {};
      const entries = Object.entries(obj);
      const len = Math.min(entries.length, opts.maxKeys);

      for (let i = 0; i < len; i++) {
        const [k, v] = entries[i];
        if (isSensitiveKey(k, opts.sensitiveKeys)) {
          result[k] = '[REDACTED]';
        } else {
          result[k] = walk(v, depth + 1);
        }
      }

      if (entries.length > opts.maxKeys) {
        result._truncated_keys_count = entries.length - opts.maxKeys;
      }

      return result;
    }

    return String(val);
  }

  return walk(value, 0);
}
