import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { PrintingService } from './printing.service';

@Injectable()
export class PrintAgentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrintAgentService.name);
  private socket: Socket;
  private readonly maxRetries = 5;
  private readonly retryDelay = 10_000;

  constructor(private readonly printing: PrintingService) {}

  onModuleInit() {
    const url = process.env.BACKEND_URL ?? 'https://api.bacalhaueciamaceio.com.br';
    this.socket = io(url, { transports: ['websocket'], reconnection: true });
    this.socket.on('connect', () => this.logger.log(`Conectado ao backend (${url})`));
    this.socket.on('disconnect', (reason) => this.logger.warn(`Desconectado: ${reason}`));
    this.socket.on('print:cashier', (order) => this.handleWithRetry(order, 'cashier'));
    this.socket.on('print:kitchen', (order) => this.handleWithRetry(order, 'kitchen'));
  }

  onModuleDestroy() {
    this.socket?.disconnect();
  }

  private async handleWithRetry(order: any, target: 'cashier' | 'kitchen'): Promise<void> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        if (target === 'cashier') await this.printing.printCashierTicket(order);
        else await this.printing.printKitchenTicket(order);
        this.logger.log(`Pedido #${order.protocol} — ${target} impresso`);
        return;
      } catch (err) {
        if (attempt < this.maxRetries) {
          this.logger.warn(
            `Tentativa ${attempt}/${this.maxRetries} falhou (${target}). Retry em ${this.retryDelay / 1000}s`,
          );
          await new Promise((r) => setTimeout(r, this.retryDelay));
        } else {
          this.logger.error(
            `Falha ao imprimir pedido #${order.protocol} (${target}) após ${this.maxRetries} tentativas`,
          );
        }
      }
    }
  }
}
