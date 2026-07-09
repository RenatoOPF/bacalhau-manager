import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { redisConnection } from './redis.config';
import { PrismaModule } from './prisma/prisma.module';
import { PrintingModule } from './printing/printing.module';
import { ORDERS_QUEUE, ORDERS_JOB_OPTIONS } from './queue/queue.constants';
import { OrdersProcessor } from './queue/orders.processor';

/**
 * Módulo do AGENTE DE IMPRESSÃO que roda no PC do caixa.
 *
 * Consome a fila de pedidos (Redis compartilhado com o backend na nuvem) e
 * imprime nas térmicas locais. Não sobe servidor HTTP, WebSocket, auth nem os
 * demais módulos da API — só o necessário para imprimir. Faz apenas conexões
 * de SAÍDA (Redis + Postgres), então dispensa túnel/exposição do caixa.
 *
 * Entrypoint: `src/worker.ts` (build → `dist/worker.js`).
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({ connection: redisConnection() }),
    BullModule.registerQueue({
      name: ORDERS_QUEUE,
      defaultJobOptions: ORDERS_JOB_OPTIONS,
    }),
    PrismaModule,
    PrintingModule,
  ],
  providers: [OrdersProcessor],
})
export class WorkerModule {}
