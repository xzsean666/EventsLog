import 'services/order_service.dart';
import 'services/payment_service.dart';

void main() async {
  print('Starting Flutter Application...');

  final orderService = OrderService();
  final paymentService = PaymentService();

  final order = await orderService.createOrder('user_123', 99.95);
  print('Created order: ${order.orderId}');

  final payment = await paymentService.processPayment(order.orderId, order.amount, 'stripe');
  print('Processed payment: ${payment.transactionId}');

  print('Discount points: ${orderService.calculateDiscount(100)}');
  print('Card valid: ${paymentService.validateCard("1234567812345678")}');
}
