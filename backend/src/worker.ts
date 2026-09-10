import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

/**
 * Entrypoint do AGENTE DE IMPRESSÃO (PC do caixa).
 *
 * Sobe apenas o contexto da aplicação (sem servidor HTTP): o PrintAgentService
 * conecta ao backend via Socket.IO e começa a escutar os eventos de impressão
 * assim que os módulos inicializam. Rode com PM2 via `agent.config.js`.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  Logger.log(
    'Agente de impressão no ar — aguardando eventos Socket.IO do backend',
    'Worker',
  );
}

bootstrap().catch((err) => {
  Logger.error(err instanceof Error ? err.message : String(err), 'Worker');
  process.exit(1);
});
