import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ORDERS_QUEUE } from '../queue/queue.constants';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';

@Module({
  imports: [BullModule.registerQueue({ name: ORDERS_QUEUE })],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
