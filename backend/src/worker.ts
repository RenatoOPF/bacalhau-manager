import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

/**
 * Entrypoint do AGENTE DE IMPRESSÃO (PC do caixa).
 *
 * Sobe apenas o contexto da aplicação (sem servidor HTTP): o BullMQ começa a
 * consumir a fila e imprimir assim que os módulos inicializam. Rode com PM2
 * via `agent.config.js` na raiz do repo.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  Logger.log(
    'Agente de impressão no ar — consumindo a fila de pedidos',
    'Worker',
  );
}

bootstrap();
