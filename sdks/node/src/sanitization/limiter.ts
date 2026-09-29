import { sanitizeValue, type SanitizerOptions } from './sanitizer.js';

export interface PayloadTruncationMetadata {
  _truncated: true;
  _original_byte_length: number;
  _max_byte_length: number;
  _message: string;
}

/**
 * Enforces a strict byte size limit on a serialized payload.
 * If the serialized JSON size in bytes exceeds maxBytes, returns a structured truncation notice.
 */
export function limitPayloadSize(value: unknown, maxBytes: number = 65536): unknown {
  if (value === undefined || value === null) {
    return value;
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch (err) {
    return {
      _truncated: true,
      _original_byte_length: 0,
      _max_byte_length: maxBytes,
      _message: `Serialization failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const byteLength = Buffer.byteLength(serialized, 'utf-8');
  if (byteLength > maxBytes) {
    const notice: PayloadTruncationMetadata = {
      _truncated: true,
      _original_byte_length: byteLength,
      _max_byte_length: maxBytes,
      _message: `Payload exceeded maximum allowed limit of ${maxBytes} bytes`,
    };
    return notice;
  }

  return value;
}

/**
 * Sanitizes and bounds the byte size of an input or return value in a single call.
 */
export function capturePayload(
  value: unknown,
  options?: SanitizerOptions,
  maxBytes: number = 65536
): unknown {
  const sanitized = sanitizeValue(value, options);
  return limitPayloadSize(sanitized, maxBytes);
}
