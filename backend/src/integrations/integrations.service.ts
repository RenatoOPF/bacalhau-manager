import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  ORDERS_QUEUE,
  PRINT_ORDER_JOB,
  PrintOrderJobData,
} from '../queue/queue.constants';
import { decodeEscPosBase64, toLines } from './escpos';
import { isIfood, parseIfood } from './ifood.parser';
import { ParsedExternalOrder } from './parsed-order';

export type IngestResult =
  | { status: 'created'; protocol: number; channel: string }
  | { status: 'duplicate'; protocol: number }
  | { status: 'unrecognized' };

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    @InjectQueue(ORDERS_QUEUE)
    private readonly ordersQueue: Queue<PrintOrderJobData>,
  ) {}

  /** Recebe o base64 de uma impressão capturada, parseia e cria o pedido. */
  async ingestCapture(rawBase64: string): Promise<IngestResult> {
    const lines = toLines(decodeEscPosBase64(rawBase64));

    let parsed: ParsedExternalOrder | null = null;
    if (isIfood(lines)) parsed = parseIfood(lines);
    // (99Food entra aqui quando tivermos amostras.)

    if (!parsed) {
      this.logger.warn('Captura não reconhecida — nenhum parser aplicável.');
      return { status: 'unrecognized' };
    }

    // Dedup: mesma comanda reimpressa não gera pedido duplicado.
    const existing = await this.prisma.order.findFirst({
      where: { channel: parsed.channel, externalId: parsed.externalId },
      select: { protocol: true },
    });
    if (existing) {
      this.logger.log(
        `Pedido ${parsed.channel} ${parsed.externalId} já existe (#${existing.protocol}).`,
      );
      return { status: 'duplicate', protocol: existing.protocol };
    }

    const order = await this.prisma.order.create({
      data: {
        channel: parsed.channel,
        externalId: parsed.externalId,
        customerName: parsed.customerName || 'Cliente',
        customerPhone: parsed.customerPhone,
        addressStreet: parsed.addressStreet || '-',
        addressComplement: parsed.addressComplement,
        addressNeighborhood: parsed.addressNeighborhood,
        addressReference: parsed.addressReference,
        paymentMethod: PaymentMethod.ONLINE,
        paymentStatus: parsed.paidOnline
          ? PaymentStatus.PAID
          : PaymentStatus.PENDING,
        paidAt: parsed.paidOnline ? new Date() : null,
        totalCents: parsed.totalCents,
        notes: [
          parsed.shortNumber ? `${parsed.channel} #${parsed.shortNumber}` : null,
          `Loc ${parsed.externalId}`,
        ]
          .filter(Boolean)
          .join(' · '),
        items: {
          create: parsed.items.map((it) => ({
            menuItemId: null,
            nameSnapshot: it.name,
            priceCents: it.priceCents,
            quantity: it.quantity,
            notes: it.notes ?? null,
          })),
        },
      },
      include: { items: true },
    });

    await this.ordersQueue.add(PRINT_ORDER_JOB, { orderId: order.id });
    this.realtime.emitOrderCreated(order);
    this.logger.log(
      `Pedido ${parsed.channel} criado (#${order.protocol}, ${parsed.items.length} itens).`,
    );
    return { status: 'created', protocol: order.protocol, channel: parsed.channel };
  }
}
