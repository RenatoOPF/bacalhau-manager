import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ORDERS_QUEUE, ORDERS_JOB_OPTIONS } from './queue.constants';
import { OrdersProcessor } from './orders.processor';

/**
 * Ativa o worker de impressão DENTRO da API quando PRINT_WORKER=on (modo
 * monolito, uma máquina só — útil em dev e no setup antigo).
 *
 * - Produção (arquitetura atual): a API roda na nuvem com PRINT_WORKER=off
 *   (só enfileira) e o agente de impressão roda no PC do caixa como processo
 *   separado (`WorkerModule` → `dist/worker.js`), consumindo a mesma fila.
 * - Dev/monolito: PRINT_WORKER=on faz a própria API consumir e imprimir.
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
