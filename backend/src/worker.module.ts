import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrintingModule } from './printing/printing.module';
import { PrintAgentService } from './printing/print-agent.service';

/**
 * Módulo do AGENTE DE IMPRESSÃO que roda no PC do caixa.
 *
 * Conecta ao backend via Socket.IO e imprime nas térmicas locais ao receber
 * os eventos `print:cashier` e `print:kitchen`. Não sobe servidor HTTP nem
 * consome Redis — só a conexão de saída ao backend na nuvem é necessária.
 *
 * Entrypoint: `src/worker.ts` (build → `dist/worker.js`).
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrintingModule,
  ],
  providers: [PrintAgentService],
})
export class WorkerModule {}
