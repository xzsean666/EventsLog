const { UserService } = require('./UserService');
const { PaymentService } = require('./PaymentService');

/**
 * Clean business service: Order Processing.
 * Orchestrates calls to UserService and PaymentService.
 */
class OrderService {
  constructor() {
    this.userService = new UserService();
    this.paymentService = new PaymentService();
  }

  async createOrder(userId, items, paymentInfo) {
    // 1. Fetch user account details
    const user = await this.userService.getUser(userId);

    // 2. Calculate subtotal
    const totalAmount = items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    );

    // 3. Process payment with customer card
    const paymentResult = await this.paymentService.processPayment(
      totalAmount,
      paymentInfo
    );

    // 4. Return confirmed order
    return {
      orderId: 'ord_' + Math.floor(Math.random() * 90000 + 10000),
      customerName: user.name,
      customerEmail: user.email,
      totalAmount,
      itemCount: items.length,
      transactionId: paymentResult.transactionId,
      status: 'confirmed',
    };
  }
}

module.exports = { OrderService };
