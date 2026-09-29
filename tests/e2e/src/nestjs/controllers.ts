import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { OrderService, PaymentService, CartItem, PaymentDetails } from './services';

export interface CreateOrderDto {
  userId: string;
  items: CartItem[];
  payment: PaymentDetails;
}

@Controller('api/orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createOrder(@Body() dto: CreateOrderDto) {
    try {
      const result = await this.orderService.createOrder(dto.userId, dto.items, dto.payment);
      return {
        success: true,
        data: result,
      };
    } catch (err) {
      console.error('[NestJS OrderController.createOrder ERROR]:', err);
      throw err;
    }
  }

  @Post('fail')
  @HttpCode(HttpStatus.CREATED)
  async createFailingOrder(@Body() dto: CreateOrderDto) {
    const result = await this.orderService.createFailingOrder(dto.userId, dto.items, dto.payment);
    return {
      success: true,
      data: result,
    };
  }

  @Get(':id')
  async getOrder(@Param('id') id: string) {
    const order = await this.orderService.getOrder(id);
    return {
      success: true,
      data: order,
    };
  }
}

@Controller('api/payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('refund')
  @HttpCode(HttpStatus.OK)
  async refund(@Body() body: { orderId: string; amount: number }) {
    const res = await this.paymentService.refund(body.orderId, body.amount);
    return {
      success: true,
      data: res,
    };
  }
}

@Controller('api/health')
export class HealthController {
  @Get()
  check() {
    return { status: 'healthy', timestamp: new Date().toISOString() };
  }
}
