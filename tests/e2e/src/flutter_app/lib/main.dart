import 'dart:io';
import 'workflows/checkout_workflow.dart';
import 'services/order_service.dart';
import 'package:eventslog_flutter/eventslog.dart';

void main(List<String> args) async {
  print('--> [Dart Runtime] Initializing Flutter E2E Driver...');
  final endpoint = args.isNotEmpty ? args[0] : 'http://127.0.0.1:8094/v1/events/batch';
  final apiKey = args.length > 1 ? args[1] : 'el_real_world_e2e_secret_999';

  EventsLog.init(EventsLogConfig(
    serviceName: 'flutter-e2e-client',
    environment: 'staging',
    endpoint: endpoint,
    batchSize: 50,
    flushIntervalMs: 50,
    captureArguments: true,
    captureReturns: true,
    headers: {
      'x-api-key': apiKey,
    },
  ));


  final workflow = CheckoutWorkflow();
  final orders = OrderService();

  // 1. Run multi-level nested workflow: executeCheckout -> reserveStock, createOrder, processTransaction, validateCardNumber
  print('--> [Dart Runtime] Running multi-level nested CheckoutWorkflow...');
  final checkoutResult = await workflow.executeCheckout('usr_vip_888', 'sku_laptop_pro', 2, 2499.0);
  print('    [Dart Runtime] Checkout completed: order_id=${checkoutResult['order_id']}');

  // 2. Run error throwing function to test error/stack trace capture
  print('--> [Dart Runtime] Running triggerOrderFailure (intentional error)...');
  try {
    await orders.triggerOrderFailure('Card issuer declined');
  } catch (e) {
    print('    [Dart Runtime] Expected error captured: $e');
  }

  // 3. Flush all buffered events to Ingestion Service
  print('--> [Dart Runtime] Flushing telemetry events to Ingestion...');
  await EventsLog.flush();
  await Future<void>.delayed(const Duration(milliseconds: 300));
  await EventsLog.close();
  print('--> [Dart Runtime] E2E Driver finished cleanly.');
  exit(0);
}
