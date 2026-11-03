import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import type { Order, OrderItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type OrderWithItems = Order & { items: OrderItem[] };

function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Emite eventos em tempo real para os clientes conectados.
 * - Cliente do cardápio: acompanha o status do próprio pedido.
 * - Painel do caixa: recebe novos pedidos e mudanças de status.
 * - Agente de impressão: recebe pedidos completos para imprimir.
 */
@WebSocketGateway({ cors: { origin: allowedOrigins(), credentials: true } })
export class RealtimeGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  // Socket ID do agente de impressão ativo. Eventos de impressão vão APENAS
  // para este socket — evita que conexões zumbi (PM2 reiniciando) imprimam
  // quando o servidor ainda não detectou a desconexão (~45 s de timeout).
  private printerSocketId: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Agente de impressão registra o próprio socket como destino exclusivo dos eventos de impressão. */
  @SubscribeMessage('printer:register')
  handlePrinterRegister(@ConnectedSocket() client: Socket) {
    this.printerSocketId = client.id;
    this.logger.log(`[PRINTER] agente registrado (socket ${client.id})`);
    client.once('disconnect', () => {
      if (this.printerSocketId === client.id) {
        this.printerSocketId = null;
        this.logger.warn(`[PRINTER] agente desconectado (socket ${client.id})`);
      }
    });
  }

  /** Worker confirma impressão bem-sucedida → grava timestamp + notifica frontend. */
  @SubscribeMessage('print:confirmed')
  async handlePrintConfirmed(
    @MessageBody() data: { orderId: string; target: 'cashier' | 'kitchen' },
  ) {
    const field = data.target === 'cashier' ? 'cashierPrintedAt' : 'kitchenPrintedAt';
    await this.prisma.order.update({
      where: { id: data.orderId },
      data: { [field]: new Date() },
    });
    this.server.emit('order:print-confirmed', { orderId: data.orderId, target: data.target });
  }

  /** Novo pedido criado — atualiza a fila do caixa. */
  emitOrderCreated(order: { protocol: number }) {
    this.server.emit('order:created', { protocol: order.protocol });
  }

  /** Mudança de status — caixa e cliente reagem. */
  emitOrderStatusChanged(order: { protocol: number }) {
    this.server.emit('order:status', { protocol: order.protocol });
  }

  /** Dispara impressão no caixa — vai só para o agente registrado. */
  emitPrintCashier(order: OrderWithItems) {
    if (!this.printerSocketId) {
      this.logger.warn(`[PRINTER] nenhum agente registrado — print:cashier ignorado (pedido #${order.protocol})`);
      return;
    }
    this.server.to(this.printerSocketId).emit('print:cashier', order);
  }

  /** Dispara impressão na cozinha — vai só para o agente registrado. */
  emitPrintKitchen(order: OrderWithItems) {
    if (!this.printerSocketId) {
      this.logger.warn(`[PRINTER] nenhum agente registrado — print:kitchen ignorado (pedido #${order.protocol})`);
      return;
    }
    this.server.to(this.printerSocketId).emit('print:kitchen', order);
  }
}
