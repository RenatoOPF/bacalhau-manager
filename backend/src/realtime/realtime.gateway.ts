import {
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

/**
 * Emite eventos em tempo real para os clientes conectados.
 * - Cliente do cardápio: acompanha o status do próprio pedido.
 * - Painel do caixa: recebe novos pedidos e mudanças de status.
 */
@WebSocketGateway({ cors: true })
export class RealtimeGateway {
  @WebSocketServer()
  server: Server;

  /** Novo pedido criado — atualiza a fila do caixa. */
  emitOrderCreated(order: unknown) {
    this.server.emit('order:created', order);
  }

  /** Mudança de status — caixa e cliente reagem. */
  emitOrderStatusChanged(order: unknown) {
    this.server.emit('order:status', order);
  }
}
