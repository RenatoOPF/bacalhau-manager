import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import * as net from 'net';
import { WorkerModule } from './worker.module';
import { redisConnection } from './redis.config';

/**
 * Espera a porta do Redis aceitar conexão antes de seguir o boot.
 *
 * No PC do caixa o Redis só é alcançável via túnel SSH (`tunnel.ps1`, porta
 * local 6379 → VM). No boot da máquina o PM2 sobe o agente antes do túnel
 * reconectar, e o Nest ficava pendurado (sem crashar, sem logar) em vez de
 * falhar rápido — só se recuperava num restart manual/automático posterior.
 * Falhar rápido aqui devolve o processo pro autorestart do PM2 em vez de
 * ficar preso num boot pela metade.
 */
function waitForRedisPort(
  host: string,
  port: number,
  { timeoutMs = 60_000, intervalMs = 1_000, attemptMs = 2_000 } = {},
): Promise<void> {
  const logger = new Logger('Worker');
  const deadline = Date.now() + timeoutMs;
  let lastLog = 0;

  const tryOnce = (): Promise<boolean> =>
    new Promise((resolve) => {
      const socket = net.connect({ host, port });
      const finish = (ok: boolean) => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(ok);
      };
      socket.setTimeout(attemptMs);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
    });

  return new Promise((resolve, reject) => {
    const attempt = async () => {
      if (await tryOnce()) {
        logger.log(`Redis (${host}:${port}) acessível — seguindo o boot.`);
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(
          new Error(
            `Redis (${host}:${port}) inacessível após ${timeoutMs}ms — túnel/serviço fora do ar?`,
          ),
        );
        return;
      }
      if (Date.now() - lastLog > 5_000) {
        logger.warn(`Aguardando Redis (${host}:${port}) ficar acessível...`);
        lastLog = Date.now();
      }
      setTimeout(attempt, intervalMs);
    };
    attempt();
  });
}

/**
 * Entrypoint do AGENTE DE IMPRESSÃO (PC do caixa).
 *
 * Sobe apenas o contexto da aplicação (sem servidor HTTP): o BullMQ começa a
 * consumir a fila e imprimir assim que os módulos inicializam. Rode com PM2
 * via `agent.config.js` na raiz do repo.
 */
async function bootstrap() {
  const { host, port } = redisConnection();
  await waitForRedisPort(host as string, port as number);

  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  Logger.log(
    'Agente de impressão no ar — consumindo a fila de pedidos',
    'Worker',
  );
}

bootstrap().catch((err) => {
  Logger.error(err instanceof Error ? err.message : String(err), 'Worker');
  process.exit(1);
});
