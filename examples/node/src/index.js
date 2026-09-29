const { OrderService } = require('./services/OrderService');

async function main() {
  console.log('[E-Commerce App] Starting purchase workflow...');

  const orderService = new OrderService();

  const order = await orderService.createOrder(
    'usr_9021',
    [
      { name: '4K Gaming Monitor', unitPrice: 350.0, quantity: 1 },
      { name: 'USB-C Docking Station', unitPrice: 85.0, quantity: 2 },
    ],
    {
      cardNumber: '4532-1111-2222-3333',
      cvv: '987',
      expiry: '12/28',
      billingZip: '94107',
    }
  );

  console.log('[E-Commerce App] Order finalized successfully:');
  console.log(JSON.stringify(order, null, 2));
}

main().catch((err) => {
  console.error('[E-Commerce App] Fatal error:', err);
  process.exit(1);
});
