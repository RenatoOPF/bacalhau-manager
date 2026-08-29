import {
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

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
 */
@WebSocketGateway({ cors: { origin: allowedOrigins(), credentials: true } })
export class RealtimeGateway {
  @WebSocketServer()
  server: Server;

  /** Novo pedido criado — atualiza a fila do caixa. */
  emitOrderCreated(order: { protocol: number }) {
    this.server.emit('order:created', { protocol: order.protocol });
  }

  /** Mudança de status — caixa e cliente reagem. */
  emitOrderStatusChanged(order: { protocol: number }) {
    this.server.emit('order:status', { protocol: order.protocol });
  }
}
