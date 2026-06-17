import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/** Intervalo [start, end) de um dia local a partir de "YYYY-MM-DD". */
function dayRange(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00`);
  if (Number.isNaN(start.getTime())) {
    throw new BadRequestException('Data inválida (use YYYY-MM-DD)');
  }
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

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

  /** Histórico de transações (pagamentos recebidos) em um período. */
  transactions(from?: string, to?: string) {
    const where: Prisma.OrderWhereInput = {
      paymentStatus: PaymentStatus.PAID,
    };
    if (from || to) {
      where.paidAt = {};
      if (from) where.paidAt.gte = dayRange(from).start;
      if (to) where.paidAt.lt = dayRange(to).end;
    }
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
