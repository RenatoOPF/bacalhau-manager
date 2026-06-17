import { Injectable } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { localDay, periodFilter } from '../common/date-range';

/**
 * Relatórios baseados em vendas realizadas (pedidos PAGOS), usando `paidAt`
 * como data de referência — consistente com o fechamento de caixa.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private paidWhere(from?: string, to?: string): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {
      paymentStatus: PaymentStatus.PAID,
    };
    const paidAt = periodFilter(from, to);
    if (paidAt) where.paidAt = paidAt;
    return where;
  }

  /** Faturamento do período: total, contagem e quebra por dia. */
  async revenue(from?: string, to?: string) {
    const orders = await this.prisma.order.findMany({
      where: this.paidWhere(from, to),
      select: { totalCents: true, paidAt: true },
    });

    const byDayMap = new Map<string, { count: number; totalCents: number }>();
    let totalCents = 0;
    for (const o of orders) {
      totalCents += o.totalCents;
      const day = o.paidAt ? localDay(o.paidAt) : 'sem-data';
      const bucket = byDayMap.get(day) ?? { count: 0, totalCents: 0 };
      bucket.count += 1;
      bucket.totalCents += o.totalCents;
      byDayMap.set(day, bucket);
    }

    const byDay = [...byDayMap.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { from, to, count: orders.length, totalCents, byDay };
  }

  /** Pedidos e faturamento por canal (próprio/iFood/Gami). */
  async byChannel(from?: string, to?: string) {
    const grouped = await this.prisma.order.groupBy({
      by: ['channel'],
      where: this.paidWhere(from, to),
      _count: { _all: true },
      _sum: { totalCents: true },
    });

    return grouped.map((g) => ({
      channel: g.channel,
      count: g._count._all,
      totalCents: g._sum.totalCents ?? 0,
    }));
  }

  /** Itens mais vendidos no período (por quantidade). */
  async topItems(from?: string, to?: string, limit = 10) {
    const items = await this.prisma.orderItem.findMany({
      where: { order: this.paidWhere(from, to) },
      select: { nameSnapshot: true, quantity: true, priceCents: true },
    });

    const map = new Map<string, { quantity: number; totalCents: number }>();
    for (const it of items) {
      const bucket = map.get(it.nameSnapshot) ?? { quantity: 0, totalCents: 0 };
      bucket.quantity += it.quantity;
      bucket.totalCents += it.priceCents * it.quantity;
      map.set(it.nameSnapshot, bucket);
    }

    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, limit);
  }

  /** CSV das transações do período (uma linha por pedido pago). */
  async exportCsv(from?: string, to?: string): Promise<string> {
    const orders = await this.prisma.order.findMany({
      where: this.paidWhere(from, to),
      orderBy: { paidAt: 'asc' },
      select: {
        protocol: true,
        customerName: true,
        channel: true,
        paymentMethod: true,
        totalCents: true,
        paidAt: true,
      },
    });

    const header = 'protocolo;cliente;canal;pagamento;total_reais;pago_em';
    const rows = orders.map((o) =>
      [
        o.protocol,
        `"${o.customerName.replace(/"/g, '""')}"`,
        o.channel,
        o.paymentMethod,
        (o.totalCents / 100).toFixed(2).replace('.', ','),
        o.paidAt ? o.paidAt.toISOString() : '',
      ].join(';'),
    );
    return [header, ...rows].join('\n');
  }
}
