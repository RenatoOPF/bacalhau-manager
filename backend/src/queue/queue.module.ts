import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ORDERS_QUEUE } from './queue.constants';
import { OrdersProcessor } from './orders.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: ORDERS_QUEUE,
      defaultJobOptions: {
        // Reprocessa até 5x com backoff exponencial em caso de falha de impressão.
        attempts: 5,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      },
    }),
  ],
  providers: [OrdersProcessor],
  exports: [BullModule],
})
export class QueueModule {}
