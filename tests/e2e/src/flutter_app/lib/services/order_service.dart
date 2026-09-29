class OrderService {
  Future<String> createOrder(String userId, double amount) async {
    await Future<void>.delayed(const Duration(milliseconds: 20));
    return 'ord_flutter_${DateTime.now().millisecondsSinceEpoch}';
  }

  Future<void> triggerOrderFailure(String reason) async {
    await Future<void>.delayed(const Duration(milliseconds: 10));
    throw StateError('Order processing failed: $reason');
  }
}
