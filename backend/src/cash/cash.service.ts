import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { dayRange, periodFilter } from '../common/date-range';

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Registra o pagamento recebido de um pedido. */
  async payOrder(id: string, paymentMethod?: PaymentMethod) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('Pedido já está pago');
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        paymentStatus: PaymentStatus.PAID,
        paidAt: new Date(),
        ...(paymentMethod ? { paymentMethod } : {}),
      },
      include: { items: true },
    });

    this.realtime.emitOrderStatusChanged(updated);
    return updated;
  }

  /** Pedidos ainda pendentes de pagamento (não cancelados). */
  pendingPayments() {
    return this.prisma.order.findMany({
      where: {
        paymentStatus: PaymentStatus.PENDING,
        status: { not: 'CANCELED' },
      },
      orderBy: { createdAt: 'asc' },
      include: { items: true },
    });
  }

  /**
   * Histórico de transações (pagamentos recebidos) em um período. Inclui os
   * pagos online (iFood/99), que entram no fechamento como as demais formas.
   */
  transactions(from?: string, to?: string) {
    const where: Prisma.OrderWhereInput = {
      paymentStatus: PaymentStatus.PAID,
    };
    const paidAt = periodFilter(from, to);
    if (paidAt) where.paidAt = paidAt;
    return this.prisma.order.findMany({
      where,
      orderBy: { paidAt: 'desc' },
      select: {
        id: true,
        protocol: true,
        customerName: true,
        paymentMethod: true,
        totalCents: true,
        paidAt: true,
      },
    });
  }

  /** Fechamento diário: totais por modalidade de pagamento. */
  async dailySummary(date: string) {
    const { start, end } = dayRange(date);

    const paid = await this.prisma.order.findMany({
      where: {
        paymentStatus: PaymentStatus.PAID,
        paidAt: { gte: start, lt: end },
      },
      select: { paymentMethod: true, totalCents: true },
    });

    const byMethod: Record<string, { count: number; totalCents: number }> = {};
    let totalCents = 0;
    for (const o of paid) {
      const m = o.paymentMethod;
      byMethod[m] ??= { count: 0, totalCents: 0 };
      byMethod[m].count += 1;
      byMethod[m].totalCents += o.totalCents;
      totalCents += o.totalCents;
    }

    return {
      date,
      count: paid.length,
      totalCents,
      byMethod,
    };
  }
}
