import 'package:test/test.dart';
import 'package:eventslog_flutter/eventslog.dart';

class MockUser {
  final String name;
  final String email;
  MockUser(this.name, this.email);

  Map<String, dynamic> toJson() => {'name': name, 'email': email};
}

class CustomObjectWithoutJson {
  final int id;
  CustomObjectWithoutJson(this.id);

  @override
  String toString() => 'CustomObject($id)';
}

void main() {
  group('EventSanitizer', () {
    late EventSanitizer sanitizer;

    setUp(() {
      sanitizer = EventSanitizer();
    });

    test('redacts sensitive keys regardless of case or delimiter', () {
      final input = {
        'username': 'john_doe',
        'password': 'secret_password_123',
        'Password': 'another_password',
        'api_key': 'ak_test_xyz',
        'ApiKey': 'ak_test_upper',
        'access-token': 'token_999',
        'authorization': 'Bearer jwt.abc.xyz',
        'credit_card': '4111222233334444',
        'cvv': '123',
      };

      final sanitized = sanitizer.sanitize(input) as Map<String, dynamic>;

      expect(sanitized['username'], equals('john_doe'));
      expect(sanitized['password'], equals(kRedactedPlaceholder));
      expect(sanitized['Password'], equals(kRedactedPlaceholder));
      expect(sanitized['api_key'], equals(kRedactedPlaceholder));
      expect(sanitized['ApiKey'], equals(kRedactedPlaceholder));
      expect(sanitized['access-token'], equals(kRedactedPlaceholder));
      expect(sanitized['authorization'], equals(kRedactedPlaceholder));
      expect(sanitized['credit_card'], equals(kRedactedPlaceholder));
      expect(sanitized['cvv'], equals(kRedactedPlaceholder));
    });

    test('recursively sanitizes nested maps and lists', () {
      final input = {
        'user': {
          'id': 'usr_1',
          'auth': {
            'refreshToken': 'rt_sensitive_value',
            'expiresIn': 3600,
          },
        },
        'items': [
          {'name': 'item1', 'secret': 'secret1'},
          {'name': 'item2', 'secret': 'secret2'},
        ],
      };

      final sanitized = sanitizer.sanitize(input) as Map<String, dynamic>;
      final user = sanitized['user'] as Map<String, dynamic>;
      final auth = user['auth'] as Map<String, dynamic>;

      expect(auth['refreshToken'], equals(kRedactedPlaceholder));
      expect(auth['expiresIn'], equals(3600));

      final items = sanitized['items'] as List<dynamic>;
      expect((items[0] as Map)['secret'], equals(kRedactedPlaceholder));
      expect((items[1] as Map)['secret'], equals(kRedactedPlaceholder));
    });

    test('protects against circular references without crashing', () {
      final mapA = <String, dynamic>{'name': 'Node A'};
      final mapB = <String, dynamic>{'name': 'Node B'};
      mapA['sibling'] = mapB;
      mapB['sibling'] = mapA; // Circular

      final sanitized = sanitizer.sanitize(mapA) as Map<String, dynamic>;
      expect(sanitized['name'], equals('Node A'));
      final siblingB = sanitized['sibling'] as Map<String, dynamic>;
      expect(siblingB['name'], equals('Node B'));
      expect(siblingB['sibling'], equals('[Circular Reference]'));
    });

    test('safely converts objects with and without toJson', () {
      final user = MockUser('Alice', 'alice@example.com');
      final sanitizedUser = sanitizer.sanitize(user) as Map<String, dynamic>;
      expect(sanitizedUser['name'], equals('Alice'));
      expect(sanitizedUser['email'], equals('alice@example.com'));

      final custom = CustomObjectWithoutJson(42);
      final sanitizedCustom = sanitizer.sanitize(custom);
      expect(sanitizedCustom, equals('CustomObject(42)'));
    });
  });
}
