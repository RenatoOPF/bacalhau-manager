import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ORDERS_QUEUE, ORDERS_JOB_OPTIONS } from './queue.constants';
import { OrdersProcessor } from './orders.processor';

/**
 * O worker de impressão (OrdersProcessor) só é ativado quando PRINT_WORKER=on.
 *
 * - Produção (PC do caixa): PRINT_WORKER=on → a instância consome a fila e
 *   imprime nas impressoras ESC/POS da rede local.
 * - Dev: deixe off para rodar a API sem tentar imprimir. Os pedidos ficam
 *   enfileirados no Redis e são impressos quando um worker subir.
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
