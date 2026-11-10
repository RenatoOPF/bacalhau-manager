import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'crypto';
import { Server, Socket } from 'socket.io';
import { OrderStatus, type Order, type OrderItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PrintConfigService } from '../printing/print-config.service';

type OrderWithItems = Order & { items: OrderItem[] };

function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Emite eventos em tempo real para os clientes conectados.
 * - Cliente do cardápio: acompanha o status do próprio pedido (sala `order:<protocol>`).
 * - Painel do caixa: recebe novos pedidos e mudanças de status (sala `staff`).
 * - Agente de impressão: recebe pedidos completos para imprimir.
 */
@WebSocketGateway({ cors: { origin: allowedOrigins(), credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  // Socket ID do agente de impressão ativo. Eventos de impressão vão APENAS
  // para este socket — evita que conexões zumbi (PM2 reiniciando) imprimam
  // quando o servidor ainda não detectou a desconexão (~45 s de timeout).
  private printerSocketId: string | null = null;
  private printerSocketAuthenticated = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly printConfig: PrintConfigService,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    if (typeof token === 'string' && token.length > 0) {
      try {
        await this.jwt.verifyAsync(token);
        client.join('staff');
      } catch {
        // Token inválido ou expirado: não entra na sala staff.
      }
    }
  }

  /** Cliente público inscreve o socket para acompanhar apenas o seu protocolo. */
  @SubscribeMessage('order:subscribe')
  handleOrderSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { protocol?: number },
  ) {
    const protocol = Number(data?.protocol);
    if (Number.isInteger(protocol) && protocol > 0) {
      client.join(`order:${protocol}`);
    }
  }

  /** Agente de impressão registra o próprio socket como destino exclusivo dos eventos de impressão. */
  @SubscribeMessage('printer:register')
  handlePrinterRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() data?: { key?: string },
  ) {
    const expectedKey = process.env.INTEGRATION_KEY;
    const providedKey =
      (typeof data?.key === 'string' ? data.key : undefined) ??
      (typeof client.handshake.auth?.key === 'string'
        ? client.handshake.auth.key
        : undefined);

    if (expectedKey) {
      if (providedKey && !safeCompare(providedKey, expectedKey)) {
        this.logger.warn(
          `[PRINTER] chave inválida em printer:register (socket ${client.id})`,
        );
        return;
      }
      if (!providedKey && this.printerSocketId && this.printerSocketAuthenticated) {
        this.logger.warn(
          `[PRINTER] tentativa sem chave bloqueada — agente autenticado já ativo (socket ${client.id})`,
        );
        return;
      }
    }

    this.printerSocketId = client.id;
    this.printerSocketAuthenticated = Boolean(
      expectedKey && providedKey && safeCompare(providedKey, expectedKey),
    );
    this.logger.log(`[PRINTER] agente registrado (socket ${client.id})`);
    client.once('disconnect', () => {
      if (this.printerSocketId === client.id) {
        this.printerSocketId = null;
        this.printerSocketAuthenticated = false;
        this.logger.warn(`[PRINTER] agente desconectado (socket ${client.id})`);
      }
    });

    // Reenvia impressões pendentes das últimas 2h que perderam o evento por desconexão.
    void this.replayPendingPrints();
  }

  private async replayPendingPrints() {
    if (!this.printerSocketId || !this.printConfig.isEnabled()) return;
    try {
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const pending = await this.prisma.order.findMany({
        where: {
          createdAt: { gte: since },
          status: { notIn: [OrderStatus.CANCELED, OrderStatus.DELIVERED] },
          OR: [{ cashierPrintedAt: null }, { kitchenPrintedAt: null }],
        },
        include: { items: true },
        orderBy: { createdAt: 'asc' },
      });
      for (const order of pending) {
        if (!this.printerSocketId) break;
        if (!order.cashierPrintedAt) {
          this.emitPrintCashier(order);
        }
        if (!order.kitchenPrintedAt) {
          this.emitPrintKitchen(order);
        }
      }
      if (pending.length > 0) {
        this.logger.log(
          `[PRINTER] ${pending.length} pedido(s) pendente(s) reenviado(s) ao agente`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `[PRINTER] falha ao buscar impressões pendentes: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Worker confirma impressão bem-sucedida → grava timestamp + notifica frontend. */
  @SubscribeMessage('print:confirmed')
  async handlePrintConfirmed(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId?: string; target?: 'cashier' | 'kitchen' },
  ) {
    if (client.id !== this.printerSocketId) {
      this.logger.warn(
        `[PRINTER] print:confirmed ignorado de socket não registrado (${client.id})`,
      );
      return;
    }
    if (
      !data ||
      typeof data.orderId !== 'string' ||
      !data.orderId ||
      (data.target !== 'cashier' && data.target !== 'kitchen')
    ) {
      return;
    }
    const field = data.target === 'cashier' ? 'cashierPrintedAt' : 'kitchenPrintedAt';
    try {
      await this.prisma.order.update({
        where: { id: data.orderId },
        data: { [field]: new Date() },
      });
      this.server
        .to('staff')
        .emit('order:print-confirmed', { orderId: data.orderId, target: data.target });
    } catch (err) {
      this.logger.warn(
        `[PRINTER] falha ao gravar confirmação de impressão (${data.orderId}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Novo pedido criado — atualiza a fila do caixa. */
  emitOrderCreated(order: { protocol: number }) {
    this.server.to('staff').emit('order:created', { protocol: order.protocol });
  }

  /** Mudança de status — caixa e cliente daquele protocolo reagem. */
  emitOrderStatusChanged(order: { protocol: number }) {
    this.server
      .to('staff')
      .to(`order:${order.protocol}`)
      .emit('order:status', { protocol: order.protocol });
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
