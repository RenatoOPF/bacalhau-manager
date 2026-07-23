import { Injectable } from '@nestjs/common';
import {
  OrderChannel,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stock/stock.service';
import { localDay, periodFilter, previousPeriod } from '../common/date-range';

/**
 * Relatórios baseados em vendas realizadas (pedidos PAGOS), usando `paidAt`
 * como data de referência — consistente com o fechamento de caixa.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
  ) {}

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

  /**
   * KPIs do período: faturamento, nº de pedidos, ticket médio e comparação
   * com o período anterior de mesma duração (só quando from+to são passados).
   */
  async summary(from?: string, to?: string) {
    const orders = await this.prisma.order.findMany({
      where: this.paidWhere(from, to),
      select: { totalCents: true },
    });
    const totalCents = orders.reduce((s, o) => s + o.totalCents, 0);
    const count = orders.length;
    const avgTicketCents = count ? Math.round(totalCents / count) : 0;

    let prev: { totalCents: number; count: number } | null = null;
    let deltaPct: number | null = null;
    if (from && to) {
      const { prevFrom, prevTo } = previousPeriod(from, to);
      const prevOrders = await this.prisma.order.findMany({
        where: this.paidWhere(prevFrom, prevTo),
        select: { totalCents: true },
      });
      const prevTotal = prevOrders.reduce((s, o) => s + o.totalCents, 0);
      prev = { totalCents: prevTotal, count: prevOrders.length };
      deltaPct =
        prevTotal > 0 ? ((totalCents - prevTotal) / prevTotal) * 100 : null;
    }

    return { from, to, totalCents, count, avgTicketCents, prev, deltaPct };
  }

  /**
   * Faturamento e nº de pedidos por dia-da-semana × hora (base para o heatmap
   * de horários de pico). Usa `paidAt` (mesma referência do faturamento).
   */
  async peakHours(from?: string, to?: string) {
    const orders = await this.prisma.order.findMany({
      where: this.paidWhere(from, to),
      select: { paidAt: true, totalCents: true },
    });

    const map = new Map<string, { count: number; totalCents: number }>();
    for (const o of orders) {
      if (!o.paidAt) continue;
      const weekday = o.paidAt.getDay(); // 0 = domingo
      const hour = o.paidAt.getHours();
      const key = `${weekday}-${hour}`;
      const bucket = map.get(key) ?? { count: 0, totalCents: 0 };
      bucket.count += 1;
      bucket.totalCents += o.totalCents;
      map.set(key, bucket);
    }

    return [...map.entries()].map(([key, v]) => {
      const [weekday, hour] = key.split('-').map(Number);
      return { weekday, hour, ...v };
    });
  }

  /** Taxa de cancelamento no período (por data de criação) e valor perdido. */
  async cancellations(from?: string, to?: string) {
    const where: Prisma.OrderWhereInput = {};
    const createdAt = periodFilter(from, to);
    if (createdAt) where.createdAt = createdAt;

    const [total, canceled] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where: { ...where, status: OrderStatus.CANCELED },
        select: { totalCents: true },
      }),
    ]);
    const lostCents = canceled.reduce((s, o) => s + o.totalCents, 0);
    const ratePct = total > 0 ? (canceled.length / total) * 100 : 0;
    return { total, canceled: canceled.length, ratePct, lostCents };
  }

  /**
   * Todos os itens vendidos no período com curva ABC: ordenados por
   * faturamento desc, com % acumulado e classe A (≤80%), B (≤95%), C (resto).
   * A cauda da lista são os "menos vendidos".
   */
  async products(from?: string, to?: string) {
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

    const rows = [...map.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.totalCents - a.totalCents);

    const grand = rows.reduce((s, r) => s + r.totalCents, 0);
    let cum = 0;
    return rows.map((r) => {
      cum += r.totalCents;
      const cumulativePct = grand > 0 ? (cum / grand) * 100 : 0;
      const cls = cumulativePct <= 80 ? 'A' : cumulativePct <= 95 ? 'B' : 'C';
      return { ...r, cumulativePct, class: cls };
    });
  }

  /**
   * Itens que costumam ser vendidos juntos (market-basket): conta co-ocorrência
   * de pares de itens distintos no mesmo pedido pago. Só pares com 2+ pedidos.
   */
  async basket(from?: string, to?: string, limit = 10) {
    const orders = await this.prisma.order.findMany({
      where: this.paidWhere(from, to),
      select: { items: { select: { nameSnapshot: true } } },
    });

    // Guarda o par direto no valor (evita separador ambíguo, já que os nomes
    // contêm espaços e traços). A chave só agrupa; a e b vêm do próprio par.
    const pairs = new Map<string, { a: string; b: string; count: number }>();
    for (const o of orders) {
      const names = [...new Set(o.items.map((i) => i.nameSnapshot))].sort();
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const a = names[i];
          const b = names[j];
          const key = `${a}|${b}`;
          const entry = pairs.get(key) ?? { a, b, count: 0 };
          entry.count += 1;
          pairs.set(key, entry);
        }
      }
    }

    return [...pairs.values()]
      .filter((p) => p.count > 1)
      .sort((x, y) => y.count - x.count)
      .slice(0, limit);
  }

  /**
   * Margem de contribuição por produto vendido: preço − custo de ingredientes
   * (CMV unitário estimado pelo StockService). Agrupa por nome+opção. Custo é o
   * ATUAL do insumo (sem snapshot histórico); `hasCost=false` sinaliza produtos
   * sem vínculo/custo cadastrado (aparecem com custo 0).
   */
  async margins(from?: string, to?: string) {
    const items = await this.prisma.orderItem.findMany({
      where: { order: this.paidWhere(from, to) },
      select: {
        nameSnapshot: true,
        optionNameSnapshot: true,
        notes: true,
        priceCents: true,
        quantity: true,
      },
    });
    const costOf = await this.stock.buildCostEstimator();

    const map = new Map<
      string,
      {
        name: string;
        optionName: string | null;
        unitPriceCents: number;
        unitCostCents: number;
        quantity: number;
      }
    >();
    for (const it of items) {
      const key = `${it.nameSnapshot}|${it.optionNameSnapshot ?? ''}`;
      const entry = map.get(key) ?? {
        name: it.nameSnapshot,
        optionName: it.optionNameSnapshot,
        unitPriceCents: it.priceCents,
        unitCostCents: costOf(
          it.nameSnapshot,
          it.optionNameSnapshot,
          it.notes,
        ),
        quantity: 0,
      };
      entry.quantity += it.quantity;
      map.set(key, entry);
    }

    return [...map.values()]
      .map((e) => {
        const marginCents = e.unitPriceCents - e.unitCostCents;
        const marginPct =
          e.unitPriceCents > 0 ? (marginCents / e.unitPriceCents) * 100 : 0;
        return {
          name: e.name,
          optionName: e.optionName,
          unitPriceCents: e.unitPriceCents,
          unitCostCents: e.unitCostCents,
          marginCents,
          marginPct,
          quantity: e.quantity,
          contributionCents: marginCents * e.quantity,
          hasCost: e.unitCostCents > 0,
        };
      })
      .sort((a, b) => b.contributionCents - a.contributionCents);
  }

  /** CMV total do período (custo de ingredientes dos itens pagos). */
  async cmvCents(from?: string, to?: string): Promise<number> {
    const items = await this.prisma.orderItem.findMany({
      where: { order: this.paidWhere(from, to) },
      select: {
        nameSnapshot: true,
        optionNameSnapshot: true,
        notes: true,
        quantity: true,
      },
    });
    const costOf = await this.stock.buildCostEstimator();
    return items.reduce(
      (sum, it) =>
        sum +
        costOf(it.nameSnapshot, it.optionNameSnapshot, it.notes) * it.quantity,
      0,
    );
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

  // ---- Financeiro (DRE / fluxo de caixa / config) ----

  private readonly DEFAULT_COMMISSION_BPS: Record<OrderChannel, number> = {
    OWN: 0,
    IFOOD: 2300,
    NOVENTA_NOVE: 2000,
    GAMI: 0,
  };

  /** Comissão (basis points) por canal, com defaults quando não configurado. */
  async channelConfig() {
    const rows = await this.prisma.channelConfig.findMany();
    const byChannel = new Map(rows.map((r) => [r.channel, r.commissionBps]));
    return (Object.keys(this.DEFAULT_COMMISSION_BPS) as OrderChannel[]).map(
      (channel) => ({
        channel,
        commissionBps:
          byChannel.get(channel) ?? this.DEFAULT_COMMISSION_BPS[channel],
      }),
    );
  }

  setChannelConfig(channel: OrderChannel, commissionBps: number) {
    return this.prisma.channelConfig.upsert({
      where: { channel },
      create: { channel, commissionBps },
      update: { commissionBps },
    });
  }

  /**
   * DRE simplificado em cascata: Receita bruta (por canal) → (−) comissões do
   * marketplace → (−) CMV (ingredientes) → (−) despesas por categoria (por
   * competência/`dueDate`) → = lucro líquido.
   */
  async dre(from?: string, to?: string) {
    const dueDate = periodFilter(from, to);
    const [byChannel, config, cmvCents, expenseGroups] = await Promise.all([
      this.byChannel(from, to),
      this.channelConfig(),
      this.cmvCents(from, to),
      this.prisma.expense.groupBy({
        by: ['categoryId'],
        where: dueDate ? { dueDate } : {},
        _sum: { amountCents: true },
      }),
    ]);

    // Nomes das categorias para rotular o DRE (evita N+1: uma busca só).
    const catIds = expenseGroups
      .map((e) => e.categoryId)
      .filter((id): id is string => !!id);
    const cats = catIds.length
      ? await this.prisma.expenseCategory.findMany({
          where: { id: { in: catIds } },
          select: { id: true, name: true },
        })
      : [];
    const catName = new Map(cats.map((c) => [c.id, c.name]));

    const bpsOf = new Map(config.map((c) => [c.channel, c.commissionBps]));
    const grossByChannel = byChannel.map((c) => {
      const bps = bpsOf.get(c.channel) ?? 0;
      return {
        channel: c.channel,
        grossCents: c.totalCents,
        commissionBps: bps,
        commissionCents: Math.round((c.totalCents * bps) / 10000),
      };
    });
    const grossCents = grossByChannel.reduce((s, c) => s + c.grossCents, 0);
    const commissionCents = grossByChannel.reduce(
      (s, c) => s + c.commissionCents,
      0,
    );

    const expensesByCategory = expenseGroups.map((e) => ({
      categoryId: e.categoryId,
      name: e.categoryId
        ? (catName.get(e.categoryId) ?? 'Categoria removida')
        : 'Sem categoria',
      amountCents: e._sum.amountCents ?? 0,
    }));
    const expensesCents = expensesByCategory.reduce(
      (s, e) => s + e.amountCents,
      0,
    );

    const netCents = grossCents - commissionCents - cmvCents - expensesCents;
    return {
      from,
      to,
      grossCents,
      grossByChannel,
      commissionCents,
      cmvCents,
      expensesByCategory,
      expensesCents,
      netCents,
    };
  }

  /**
   * Fluxo de caixa por dia: entradas (pedidos pagos por `paidAt`) vs saídas
   * (despesas efetivamente pagas por `paidAt`), com saldo acumulado.
   */
  async cashflow(from?: string, to?: string) {
    const paidFilter = periodFilter(from, to);
    const [orders, expenses] = await Promise.all([
      this.prisma.order.findMany({
        where: this.paidWhere(from, to),
        select: { paidAt: true, totalCents: true },
      }),
      this.prisma.expense.findMany({
        where: { paidAt: paidFilter ? { not: null, ...paidFilter } : { not: null } },
        select: { paidAt: true, amountCents: true },
      }),
    ]);

    const map = new Map<string, { inCents: number; outCents: number }>();
    for (const o of orders) {
      if (!o.paidAt) continue;
      const day = localDay(o.paidAt);
      const bucket = map.get(day) ?? { inCents: 0, outCents: 0 };
      bucket.inCents += o.totalCents;
      map.set(day, bucket);
    }
    for (const e of expenses) {
      if (!e.paidAt) continue;
      const day = localDay(e.paidAt);
      const bucket = map.get(day) ?? { inCents: 0, outCents: 0 };
      bucket.outCents += e.amountCents;
      map.set(day, bucket);
    }

    let balance = 0;
    return [...map.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => {
        const netCents = d.inCents - d.outCents;
        balance += netCents;
        return { ...d, netCents, balanceCents: balance };
      });
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
