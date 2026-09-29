/**
 * Clean business service: Payment Processing.
 * Zero telemetry or APM code. Handles sensitive customer payment data.
 */
class PaymentService {
  async processPayment(amount, paymentDetails) {
    // Simulate gateway roundtrip latency
    await new Promise((resolve) => setTimeout(resolve, 25));

    if (amount <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    const txId = 'tx_' + Math.random().toString(36).substring(2, 10);
    return {
      transactionId: txId,
      amount,
      status: 'settled',
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = { PaymentService };
