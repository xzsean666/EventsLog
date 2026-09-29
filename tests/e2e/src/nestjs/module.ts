import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { OrderController, PaymentController, HealthController } from './controllers';
import { OrderService, PaymentService, InventoryService } from './services';
import { EventsLogTraceMiddleware } from './eventslog';

@Module({
  controllers: [OrderController, PaymentController, HealthController],
  providers: [OrderService, PaymentService, InventoryService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(EventsLogTraceMiddleware).forRoutes('*');
  }
}
