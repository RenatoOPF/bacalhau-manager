import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
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

  constructor(private readonly prisma: PrismaService) {}

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

  /** Dispara impressão no caixa — agente local recebe e imprime. */
  emitPrintCashier(order: OrderWithItems) {
    this.server.emit('print:cashier', order);
  }

  /** Dispara impressão na cozinha — agente local recebe e imprime. */
  emitPrintKitchen(order: OrderWithItems) {
    this.server.emit('print:kitchen', order);
  }
}
