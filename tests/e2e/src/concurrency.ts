import { generateTraceId } from '@eventslog/node';

export interface ConcurrencyTestOptions {
  backendUrl: string;
  concurrency: number;
}

export async function runConcurrencyTest(options: ConcurrencyTestOptions) {
  const { backendUrl, concurrency } = options;
  const requests = Array.from({ length: concurrency }).map(async (_, idx) => {
    const traceId = generateTraceId();
    const userId = `usr_concurrent_${idx}_${Date.now()}`;

    const res = await fetch(`${backendUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-trace-id': traceId,
      },
      body: JSON.stringify({
        userId,
        items: [
          {
            id: `item_${idx}`,
            name: `Widget ${idx}`,
            price: 10 + idx,
            quantity: 1,
          },
        ],
        payment: {
          cardNumber: `4532-0000-0000-${String(idx).padStart(4, '0')}`,
          cvv: '999',
          expiry: '10/30',
          billingZip: '94016',
        },
      }),
    });

    const responseTraceId = res.headers.get('x-trace-id');
    const data = await res.json();

    return {
      index: idx,
      sentTraceId: traceId,
      receivedTraceId: responseTraceId,
      status: res.status,
      success: res.ok && responseTraceId === traceId,
      data,
    };
  });

  const results = await Promise.all(requests);
  if (results.length > 0) {
    console.log('    [Concurrency Debug Sample]:', {
      sentTraceId: results[0].sentTraceId,
      receivedTraceId: results[0].receivedTraceId,
      status: results[0].status,
      success: results[0].success,
      data: results[0].data,
    });
  }
  const allSuccessful = results.every((r) => r.success);
  const distinctTraceIds = new Set(results.map((r) => r.sentTraceId)).size;

  return {
    total: concurrency,
    successfulCount: results.filter((r) => r.success).length,
    allSuccessful,
    distinctTraceIds,
    results,
  };
}
