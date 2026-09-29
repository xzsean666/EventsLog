import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './module';
import { OrderController, PaymentController, HealthController } from './controllers';
import { OrderService, PaymentService, InventoryService } from './services';
import { instrumentNestApp } from './eventslog';
import type { EventsLogConfig, EventSink } from '@eventslog/node';
import type { INestApplication } from '@nestjs/common';

export interface NestServerInstance {
  app: INestApplication;
  port: number;
  url: string;
  close: () => Promise<void>;
}

export async function startNestServer(
  port = 0,
  config?: EventsLogConfig,
  sink?: EventSink
): Promise<NestServerInstance> {
  // If config and sink are provided, patch NestJS controllers and services
  if (config && sink) {
    instrumentNestApp(
      [
        OrderController,
        PaymentController,
        HealthController,
        OrderService,
        PaymentService,
        InventoryService,
      ],
      config,
      sink
    );
  }

  const app = await NestFactory.create(AppModule, { logger: false });
  app.enableCors({
    origin: '*',
    allowedHeaders: '*',
  });

  const server = await app.listen(port);
  const actualPort = server.address().port;
  const url = `http://127.0.0.1:${actualPort}`;

  return {
    app,
    port: actualPort,
    url,
    close: async () => {
      await app.close();
    },
  };
}
