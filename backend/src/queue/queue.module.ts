import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ORDERS_QUEUE, ORDERS_JOB_OPTIONS } from './queue.constants';
import { OrdersProcessor } from './orders.processor';

/**
 * O worker de impressão (OrdersProcessor) só é ativado quando
 * PRINT_WORKER=on. Assim o MESMO código roda em dois papéis:
 *
 * - Backend na nuvem (Fly.io): PRINT_WORKER off → apenas enfileira os
 *   pedidos no Redis. Não tem acesso às impressoras da rede local.
 * - Agente local no PC do caixa: PRINT_WORKER=on → consome a fila e
 *   imprime nas impressoras ESC/POS da rede local.
 *
 * Ambos apontam para o MESMO Redis (REDIS_URL) e Postgres (DATABASE_URL).
 */
const PRINT_WORKER_ENABLED = process.env.PRINT_WORKER === 'on';

@Module({
  imports: [
    BullModule.registerQueue({
      name: ORDERS_QUEUE,
      defaultJobOptions: ORDERS_JOB_OPTIONS,
    }),
  ],
  providers: PRINT_WORKER_ENABLED ? [OrdersProcessor] : [],
  exports: [BullModule],
})
export class QueueModule {}
