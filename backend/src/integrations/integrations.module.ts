import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ORDERS_QUEUE, ORDERS_JOB_OPTIONS } from '../queue/queue.constants';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';

@Module({
  imports: [
    BullModule.registerQueue({
      name: ORDERS_QUEUE,
      defaultJobOptions: ORDERS_JOB_OPTIONS,
    }),
  ],
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
})
export class IntegrationsModule {}
