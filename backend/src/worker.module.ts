import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrintingService } from './printing/printing.service';
import { PrintConfigService } from './printing/print-config.service';
import { PrintAgentService } from './printing/print-agent.service';

/**
 * Módulo do AGENTE DE IMPRESSÃO que roda no PC do caixa.
 *
 * Registra só os serviços necessários (sem controller, sem auth, sem HTTP)
 * para evitar puxar dependências que não existem neste contexto.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
  ],
  providers: [PrintingService, PrintConfigService, PrintAgentService],
})
export class WorkerModule {}
