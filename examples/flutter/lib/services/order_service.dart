class Order {
  final String orderId;
  final String userId;
  final double amount;
  final String status;

  Order({
    required this.orderId,
    required this.userId,
    required this.amount,
    required this.status,
  });

  Map<String, dynamic> toJson() => {
    'orderId': orderId,
    'userId': userId,
    'amount': amount,
    'status': status,
  };
}

class OrderService {
  Future<Order> createOrder(String userId, double amount) async {
    // Simulating remote order processing
    await Future<void>.delayed(const Duration(milliseconds: 20));
    return Order(
      orderId: 'ord_${DateTime.now().millisecondsSinceEpoch}',
      userId: userId,
      amount: amount,
      status: 'confirmed',
    );
  }

  int calculateDiscount(int basePoints) {
    return (basePoints * 1.5).round();
  }
}
