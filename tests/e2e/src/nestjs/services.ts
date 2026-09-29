import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface PaymentDetails {
  cardNumber: string;
  cvv: string;
  expiry: string;
  billingZip: string;
  authToken?: string;
}

@Injectable()
export class InventoryService {
  async checkAndReserve(items: CartItem[]): Promise<{ reservationId: string; reservedCount: number }> {
    // Simulate async inventory check
    await new Promise((resolve) => setTimeout(resolve, 15));
    const reservedCount = items.reduce((acc, item) => acc + item.quantity, 0);
    return {
      reservationId: `res_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      reservedCount,
    };
  }

  async releaseReservation(reservationId: string): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return true;
  }
}

@Injectable()
export class PaymentService {
  async processPayment(
    userId: string,
    amount: number,
    paymentInfo: PaymentDetails
  ): Promise<{ transactionId: string; status: string; processedAmount: number }> {
    // Simulate async payment processing
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Simulate payment declination for bad card
    if (paymentInfo.cardNumber.startsWith('4000-0000-0000')) {
      throw new HttpException(
        'Payment failed: Card was declined due to insufficient funds or security restrictions',
        HttpStatus.PAYMENT_REQUIRED
      );
    }

    return {
      transactionId: `tx_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      status: 'settled',
      processedAmount: amount,
    };
  }

  async refund(orderId: string, amount: number): Promise<{ refundId: string; refundedAmount: number }> {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return {
      refundId: `ref_${Date.now()}`,
      refundedAmount: amount,
    };
  }
}

@Injectable()
export class OrderService {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly paymentService: PaymentService
  ) {}

  async createOrder(
    userId: string,
    items: CartItem[],
    paymentInfo: PaymentDetails
  ): Promise<{ orderId: string; totalAmount: number; reservationId: string; transactionId: string }> {
    // 1. Reserve inventory
    const reservation = await this.inventoryService.checkAndReserve(items);

    // 2. Calculate total
    const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    // 3. Process payment
    const payment = await this.paymentService.processPayment(userId, totalAmount, paymentInfo);

    // 4. Return confirmed order
    return {
      orderId: `ord_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      totalAmount,
      reservationId: reservation.reservationId,
      transactionId: payment.transactionId,
    };
  }

  async createFailingOrder(
    userId: string,
    items: CartItem[],
    paymentInfo: PaymentDetails
  ): Promise<any> {
    await this.inventoryService.checkAndReserve(items);
    const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    // This will throw PaymentRequired exception
    return await this.paymentService.processPayment(userId, totalAmount, paymentInfo);
  }

  async getOrder(orderId: string): Promise<{ orderId: string; status: string; customerId: string }> {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return {
      orderId,
      status: 'completed',
      customerId: 'usr_premium_101',
    };
  }
}
