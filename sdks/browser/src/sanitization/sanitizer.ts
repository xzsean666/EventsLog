const DEFAULT_SENSITIVE_KEY_PATTERNS = [
  /pass(?:word)?/i,
  /secret/i,
  /token/i,
  /auth(?:orization)?/i,
  /bearer/i,
  /cookie/i,
  /api[_-]?key/i,
  /private[_-]?key/i,
  /credential/i,
  /session[_-]?id/i,
  /credit[_-]?card/i,
  /ssn/i,
];

// Sensitive value patterns (e.g. JWTs, Credit Cards, Bearer tokens in positional parameter arrays)
const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /\b(?:\d{4}[ -]?){3}\d{4}\b/,
  /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/,
  /^bearer\s+[a-zA-Z0-9_.-]{16,}$/i,
];

export const REDACTED_STRING = '[REDACTED]';

export interface SanitizerOptions {
  customSensitiveKeys?: string[];
  maxDepth?: number;
  maxPayloadBytes?: number;
}

export class BrowserSanitizer {
  private readonly sensitivePatterns: RegExp[];
  private readonly maxDepth: number;
  private readonly maxPayloadBytes: number;

  constructor(options?: SanitizerOptions) {
    this.maxDepth = options?.maxDepth ?? 4;
    this.maxPayloadBytes = options?.maxPayloadBytes ?? 32 * 1024; // 32 KB

    this.sensitivePatterns = [...DEFAULT_SENSITIVE_KEY_PATTERNS];
    if (options?.customSensitiveKeys) {
      for (const pattern of options.customSensitiveKeys) {
        this.sensitivePatterns.push(new RegExp(pattern, 'i'));
      }
    }
  }

  isKeySensitive(key: string): boolean {
    return this.sensitivePatterns.some((pattern) => pattern.test(key));
  }

  isValueSensitive(val: string): boolean {
    return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(val));
  }

  sanitize(value: unknown): unknown {
    const seen = new WeakSet();
    const sanitizedObj = this.sanitizeRecursive(value, 0, seen);

    // Bounded serialization check
    try {
      const json = JSON.stringify(sanitizedObj);
      if (json && json.length > this.maxPayloadBytes) {
        return {
          _truncated: true,
          _original_length_bytes: json.length,
          preview: json.slice(0, 1024) + '... [TRUNCATED_EXCEEDED_MAX_PAYLOAD]',
        };
      }
    } catch {
      return '[UNSERIALIZABLE_PAYLOAD]';
    }

    return sanitizedObj;
  }

  private sanitizeRecursive(val: unknown, depth: number, seen: WeakSet<object>): unknown {
    if (val === null || val === undefined) {
      return val;
    }

    if (typeof val === 'string') {
      if (this.isValueSensitive(val)) {
        return REDACTED_STRING;
      }
      return val;
    }

    if (typeof val === 'number' || typeof val === 'boolean') {
      return val;
    }

    if (typeof val === 'bigint') {
      return val.toString();
    }

    if (typeof val === 'function') {
      return `[Function: ${val.name || 'anonymous'}]`;
    }

    if (val instanceof Error) {
      return {
        name: val.name,
        message: val.message,
        stack: val.stack,
      };
    }

    if (typeof val === 'object') {
      if (seen.has(val)) {
        return '[CIRCULAR_REFERENCE]';
      }
      seen.add(val);

      if (depth >= this.maxDepth) {
        return '[MAX_DEPTH_REACHED]';
      }

      if (Array.isArray(val)) {
        return val.map((item) => this.sanitizeRecursive(item, depth + 1, seen));
      }

      // Check for browser Window, Document, DOM nodes, Events
      if (typeof window !== 'undefined' && val === window) {
        return '[Window]';
      }
      if (typeof document !== 'undefined' && val === document) {
        return '[Document]';
      }
      if (typeof Node !== 'undefined' && val instanceof Node) {
        if (typeof HTMLElement !== 'undefined' && val instanceof HTMLElement) {
          return `<${val.tagName.toLowerCase()}${val.id ? ` id="${val.id}"` : ''}${val.className ? ` class="${val.className}"` : ''}>`;
        }
        return `[Node: ${val.nodeName}]`;
      }
      if (typeof Event !== 'undefined' && val instanceof Event) {
        return `[Event: ${val.type}]`;
      }

      const result: Record<string, unknown> = {};
      let keys: string[] = [];
      try {
        keys = Object.getOwnPropertyNames(val);
      } catch {
        try {
          keys = Object.keys(val as object);
        } catch {
          return '[Uninspectable Object]';
        }
      }

      for (const key of keys) {
        if (this.isKeySensitive(key)) {
          result[key] = REDACTED_STRING;
        } else {
          try {
            const propVal = (val as Record<string, unknown>)[key];
            result[key] = this.sanitizeRecursive(propVal, depth + 1, seen);
          } catch {
            result[key] = '[Inaccessible Property]';
          }
        }
      }

      return result;
    }

    return String(val);
  }
}
