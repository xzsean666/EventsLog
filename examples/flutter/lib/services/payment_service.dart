class PaymentResult {
  final String transactionId;
  final bool success;
  final String gateway;

  PaymentResult({
    required this.transactionId,
    required this.success,
    required this.gateway,
  });

  Map<String, dynamic> toJson() => {
    'transactionId': transactionId,
    'success': success,
    'gateway': gateway,
  };
}

class PaymentService {
  Future<PaymentResult> processPayment(String orderId, double amount, String method) async {
    // Simulating gateway transaction
    await Future<void>.delayed(const Duration(milliseconds: 30));
    return PaymentResult(
      transactionId: 'txn_${DateTime.now().millisecondsSinceEpoch}',
      success: true,
      gateway: method,
    );
  }

  bool validateCard(String cardNumber) => cardNumber.length >= 16;
}
