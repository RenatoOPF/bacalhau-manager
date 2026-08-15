import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ORDERS_QUEUE, ORDERS_JOB_OPTIONS } from '../queue/queue.constants';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { StockModule } from '../stock/stock.module';

@Module({
  // defaultJobOptions no lado produtor: o retry é gravado no job ao enfileirar.
  imports: [
    BullModule.registerQueue({
      name: ORDERS_QUEUE,
      defaultJobOptions: ORDERS_JOB_OPTIONS,
    }),
    StockModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
