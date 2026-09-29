import '../services/inventory_service.dart';
import '../services/payment_service.dart';
import '../services/order_service.dart';

class CheckoutWorkflow {
  final InventoryService inventory = InventoryService();
  final OrderService orders = OrderService();
  final PaymentService payments = PaymentService();

  Future<Map<String, dynamic>> executeCheckout(String userId, String sku, int quantity, double totalAmount) async {
    // Step 1: Reserve Stock (child function 1)
    final reserved = await inventory.reserveStock(sku, quantity);
    if (!reserved) throw Exception('Out of stock');

    // Step 2: Create Order (child function 2)
    final orderId = await orders.createOrder(userId, totalAmount);

    // Step 3: Process Transaction (child function 3)
    final payment = await payments.processTransaction(orderId, totalAmount, 'apple_pay');

    return {
      'order_id': orderId,
      'payment_status': payment['status'],
      'card_valid': payments.validateCardNumber('1234567812345678'),
    };
  }
}
