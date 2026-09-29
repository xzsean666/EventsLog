class PaymentService {
  Future<Map<String, dynamic>> processTransaction(String orderId, double amount, String method) async {
    await Future<void>.delayed(const Duration(milliseconds: 20));
    return {
      'transaction_id': 'txn_${orderId}',
      'status': 'authorized',
      'amount': amount,
      'gateway': method,
    };
  }

  bool validateCardNumber(String cardNumber) => cardNumber.length == 16;
}
