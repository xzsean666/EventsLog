import 'dart:convert';

/// Default sensitive keys masked automatically during data capture.
const List<String> kDefaultSensitiveKeys = [
  'password',
  'passwd',
  'token',
  'secret',
  'authorization',
  'api_key',
  'apikey',
  'access_token',
  'refresh_token',
  'private_key',
  'credit_card',
  'card_number',
  'cvv',
  'ssn',
];

/// Redaction placeholder for sensitive fields.
const String kRedactedPlaceholder = '[REDACTED]';

/// Sanitizes inputs, outputs, and attributes to protect sensitive PII,
/// prevent circular reference crashes, and enforce depth limits.
class EventSanitizer {
  final Set<String> _normalizedSensitiveKeys;
  final int maxDepth;

  EventSanitizer({
    List<String>? sensitiveKeys,
    this.maxDepth = 6,
  }) : _normalizedSensitiveKeys = (sensitiveKeys ?? kDefaultSensitiveKeys)
            .map(_normalizeKey)
            .toSet();

  static String _normalizeKey(String key) {
    return key.toLowerCase().replaceAll(RegExp(r'[-_]'), '');
  }

  /// Checks if a key matches any sensitive key.
  bool isSensitiveKey(String key) {
    return _normalizedSensitiveKeys.contains(_normalizeKey(key));
  }

  /// Sanitizes an arbitrary value (argument map, return value, or attribute).
  dynamic sanitize(dynamic value) {
    final seen = <dynamic>{};
    return _sanitizeInternal(value, 0, seen);
  }

  dynamic _sanitizeInternal(dynamic value, int depth, Set<dynamic> seen) {
    if (value == null) return null;
    if (value is num || value is bool || value is String) return value;

    if (depth >= maxDepth) {
      return '[Max Depth Exceeded]';
    }

    if (seen.contains(value)) {
      return '[Circular Reference]';
    }

    if (value is Map) {
      seen.add(value);
      try {
        final result = <String, dynamic>{};
        for (final entry in value.entries) {
          final keyStr = entry.key.toString();
          if (isSensitiveKey(keyStr)) {
            result[keyStr] = kRedactedPlaceholder;
          } else {
            result[keyStr] = _sanitizeInternal(entry.value, depth + 1, seen);
          }
        }
        return result;
      } finally {
        seen.remove(value);
      }
    }

    if (value is Iterable) {
      seen.add(value);
      try {
        return value.map((item) => _sanitizeInternal(item, depth + 1, seen)).toList();
      } finally {
        seen.remove(value);
      }
    }

    // Try toJson() if object defines it
    try {
      final dynamic dyn = value;
      final dynamic jsonCandidate = dyn.toJson();
      if (jsonCandidate != null && jsonCandidate != value) {
        return _sanitizeInternal(jsonCandidate, depth + 1, seen);
      }
    } catch (_) {
      // Fallback to string
    }

    try {
      jsonEncode(value);
      return value;
    } catch (_) {
      return value.toString();
    }
  }
}
