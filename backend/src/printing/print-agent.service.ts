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
    this.socket.on('connect', () => {
      this.logger.log(`Conectado ao backend (${url})`);
      // Registra este socket como destino exclusivo dos eventos de impressão.
      // Reenviado a cada reconexão para que o servidor sempre aponte para a
      // conexão mais recente — evita que sockets zumbi recebam os eventos.
      this.socket.emit('printer:register');
    });
    this.socket.on('disconnect', (reason) => this.logger.warn(`Desconectado: ${reason}`));
    this.socket.on('print:cashier', (order) => this.handleCashier(order));
    this.socket.on('print:kitchen', (order) => this.handleWithRetry(order, 'kitchen'));
  }

  onModuleDestroy() {
    this.socket?.disconnect();
  }

  private async handleCashier(order: any): Promise<void> {
    try {
      await this.printing.printCashierTicket(order);
      this.logger.log(`Pedido #${order.protocol} — caixa impresso`);
      this.socket.emit('print:confirmed', { orderId: order.id, target: 'cashier' });
    } catch (err) {
      this.logger.error(
        `Falha ao imprimir pedido #${order.protocol} (caixa): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async handleWithRetry(order: any, target: 'kitchen'): Promise<void> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        await this.printing.printKitchenTicket(order);
        this.logger.log(`Pedido #${order.protocol} — ${target} impresso`);
        this.socket.emit('print:confirmed', { orderId: order.id, target });
        return;
      } catch (err) {
        this.logger.warn(
          `Tentativa ${attempt}/${this.maxRetries} falhou (${target}): ${err instanceof Error ? err.message : err}`,
        );
        if (attempt < this.maxRetries) {
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
