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
  private readonly cache = new Map<
    string,
    { data: unknown; expiresAt: number }
  >();
  private readonly CACHE_TTL_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
  ) {}

  private async cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.cache.get(key);
    if (hit && now < hit.expiresAt) {
      return hit.data as T;
    }
    const data = await compute();
    this.cache.set(key, { data, expiresAt: now + this.CACHE_TTL_MS });
    return data;
  }

  private paidWhere(from?: string, to?: string): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {
      paymentStatus: PaymentStatus.PAID,
      status: { not: OrderStatus.CANCELED },
    };
    const paidAt = periodFilter(from, to);
    if (paidAt) where.paidAt = paidAt;
    return where;
  }

  /** Faturamento do período: total, contagem e quebra por dia. */
  async revenue(from?: string, to?: string) {
    return this.cached(`revenue:${from ?? ''}:${to ?? ''}`, async () => {
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
    });
  }

  /**
   * KPIs do período: faturamento, nº de pedidos, ticket médio e comparação
   * com o período anterior de mesma duração (só quando from+to são passados).
   */
  async summary(from?: string, to?: string) {
    return this.cached(`summary:${from ?? ''}:${to ?? ''}`, async () => {
      const agg = await this.prisma.order.aggregate({
        where: this.paidWhere(from, to),
        _sum: { totalCents: true },
        _count: { _all: true },
      });
      const totalCents = agg._sum.totalCents ?? 0;
      const count = agg._count._all;
      const avgTicketCents = count ? Math.round(totalCents / count) : 0;

      let prev: { totalCents: number; count: number } | null = null;
      let deltaPct: number | null = null;
      if (from && to) {
        const { prevFrom, prevTo } = previousPeriod(from, to);
        const prevAgg = await this.prisma.order.aggregate({
          where: this.paidWhere(prevFrom, prevTo),
          _sum: { totalCents: true },
          _count: { _all: true },
        });
        const prevTotal = prevAgg._sum.totalCents ?? 0;
        prev = { totalCents: prevTotal, count: prevAgg._count._all };
        deltaPct =
          prevTotal > 0 ? ((totalCents - prevTotal) / prevTotal) * 100 : null;
      }

      return { from, to, totalCents, count, avgTicketCents, prev, deltaPct };
    });
  }

  /**
   * Faturamento e nº de pedidos por dia-da-semana × hora (base para o heatmap
   * de horários de pico). Usa `paidAt` (mesma referência do faturamento).
   */
  async peakHours(from?: string, to?: string) {
    return this.cached(`peakHours:${from ?? ''}:${to ?? ''}`, async () => {
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
    });
  }

  /** Taxa de cancelamento no período (por data de criação) e valor perdido. */
  async cancellations(from?: string, to?: string) {
    return this.cached(`cancellations:${from ?? ''}:${to ?? ''}`, async () => {
      const where: Prisma.OrderWhereInput = {};
      const createdAt = periodFilter(from, to);
      if (createdAt) where.createdAt = createdAt;

      const [total, canceledAgg] = await Promise.all([
        this.prisma.order.count({ where }),
        this.prisma.order.aggregate({
          where: { ...where, status: OrderStatus.CANCELED },
          _count: { _all: true },
          _sum: { totalCents: true },
        }),
      ]);
      const canceledCount = canceledAgg._count._all;
      const lostCents = canceledAgg._sum.totalCents ?? 0;
      const ratePct = total > 0 ? (canceledCount / total) * 100 : 0;
      return { total, canceled: canceledCount, ratePct, lostCents };
    });
  }

  /** Agrupa OrderItems pagos por produto/opção/preço/custo direto no banco. */
  private getGroupedOrderItems(from?: string, to?: string) {
    return this.cached(`groupedItems:${from ?? ''}:${to ?? ''}`, () =>
      this.prisma.orderItem.groupBy({
        by: [
          'nameSnapshot',
          'optionNameSnapshot',
          'notes',
          'priceCents',
          'unitCostCents',
        ],
        where: { order: this.paidWhere(from, to) },
        _sum: { quantity: true },
      }),
    );
  }

  /**
   * Todos os itens vendidos no período com curva ABC: ordenados por
   * faturamento desc, com % acumulado e classe A (≤80%), B (≤95%), C (resto).
   * A cauda da lista são os "menos vendidos".
   */
  async products(from?: string, to?: string) {
    const groups = await this.getGroupedOrderItems(from, to);

    const map = new Map<string, { quantity: number; totalCents: number }>();
    for (const g of groups) {
      const qty = g._sum.quantity ?? 0;
      const bucket = map.get(g.nameSnapshot) ?? { quantity: 0, totalCents: 0 };
      bucket.quantity += qty;
      bucket.totalCents += g.priceCents * qty;
      map.set(g.nameSnapshot, bucket);
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
    return this.cached(`basket:${from ?? ''}:${to ?? ''}:${limit}`, async () => {
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
    });
  }

  /**
   * Margem de contribuição por produto vendido: preço − CMV unitário.
   * Para itens com `unitCostCents > 0` usa o snapshot gravado no momento da
   * venda (imune a reajustes futuros de insumo). Para itens históricos sem
   * snapshot (unitCostCents = 0), cai no estimador com o custo atual — mantendo
   * o comportamento anterior para o legado. Agrupa por nome+opção; preço e custo
   * exibidos são médias ponderadas pela quantidade.
   */
  async margins(from?: string, to?: string) {
    const groups = await this.getGroupedOrderItems(from, to);

    // Carrega o estimador apenas quando há itens legados sem snapshot.
    const needsEstimator = groups.some((g) => g.unitCostCents === 0);
    const costOf = needsEstimator ? await this.stock.buildCostEstimator() : null;

    const map = new Map<
      string,
      {
        name: string;
        optionName: string | null;
        totalRevenueCents: number;
        totalCostCents: number;
        quantity: number;
        hasAnyCost: boolean;
      }
    >();
    for (const g of groups) {
      const qty = g._sum.quantity ?? 0;
      if (qty <= 0) continue;
      const cost =
        g.unitCostCents > 0
          ? g.unitCostCents
          : (costOf?.(g.nameSnapshot, g.optionNameSnapshot, g.notes) ?? 0);
      const key = `${g.nameSnapshot}|${g.optionNameSnapshot ?? ''}`;
      const entry = map.get(key) ?? {
        name: g.nameSnapshot,
        optionName: g.optionNameSnapshot,
        totalRevenueCents: 0,
        totalCostCents: 0,
        quantity: 0,
        hasAnyCost: false,
      };
      entry.totalRevenueCents += g.priceCents * qty;
      entry.totalCostCents += cost * qty;
      entry.quantity += qty;
      if (cost > 0) entry.hasAnyCost = true;
      map.set(key, entry);
    }

    return [...map.values()]
      .map((e) => {
        const unitPriceCents =
          e.quantity > 0 ? Math.round(e.totalRevenueCents / e.quantity) : 0;
        const unitCostCents =
          e.quantity > 0 ? Math.round(e.totalCostCents / e.quantity) : 0;
        const marginCents = unitPriceCents - unitCostCents;
        const marginPct =
          unitPriceCents > 0 ? (marginCents / unitPriceCents) * 100 : 0;
        return {
          name: e.name,
          optionName: e.optionName,
          unitPriceCents,
          unitCostCents,
          marginCents,
          marginPct,
          quantity: e.quantity,
          contributionCents: e.totalRevenueCents - e.totalCostCents,
          hasCost: e.hasAnyCost,
        };
      })
      .sort((a, b) => b.contributionCents - a.contributionCents);
  }

  /** CMV total do período (custo de ingredientes dos itens pagos). */
  async cmvCents(from?: string, to?: string): Promise<number> {
    const groups = await this.getGroupedOrderItems(from, to);

    let storedCmv = 0;
    const legacy: typeof groups = [];
    for (const g of groups) {
      const qty = g._sum.quantity ?? 0;
      if (qty <= 0) continue;
      if (g.unitCostCents > 0) {
        storedCmv += g.unitCostCents * qty;
      } else {
        legacy.push(g);
      }
    }
    if (legacy.length === 0) return storedCmv;

    const costOf = await this.stock.buildCostEstimator();
    const legacyCmv = legacy.reduce(
      (sum, g) =>
        sum +
        costOf(g.nameSnapshot, g.optionNameSnapshot, g.notes) *
          (g._sum.quantity ?? 0),
      0,
    );
    return storedCmv + legacyCmv;
  }

  /**
   * Repasse a pagar por entregador no período: nº de entregas e soma do
   * `courierFeeCents`. Considera pedidos com entregador designado, por data de
   * criação (operacional). Inclui entregas sem entregador designado à parte.
   */
  async couriers(from?: string, to?: string) {
    const where: Prisma.OrderWhereInput = { courierId: { not: null } };
    const createdAt = periodFilter(from, to);
    if (createdAt) where.createdAt = createdAt;

    const grouped = await this.prisma.order.groupBy({
      by: ['courierId'],
      where,
      _count: { _all: true },
      _sum: { courierFeeCents: true },
    });

    const courierIds = grouped
      .map((g) => g.courierId)
      .filter((id): id is string => !!id);
    const employees = courierIds.length
      ? await this.prisma.employee.findMany({
          where: { id: { in: courierIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(employees.map((e) => [e.id, e.name]));

    return grouped
      .filter((g): g is typeof g & { courierId: string } => !!g.courierId)
      .map((g) => ({
        courierId: g.courierId,
        courierName: nameById.get(g.courierId) ?? '—',
        deliveries: g._count._all,
        totalCents: g._sum.courierFeeCents ?? 0,
      }))
      .sort((a, b) => b.totalCents - a.totalCents);
  }

  /** Pedidos detalhados de um entregador específico no período (visão admin). */
  async courierOrders(courierId: string, from?: string, to?: string) {
    const where: Prisma.OrderWhereInput = { courierId };
    const createdAt = periodFilter(from, to);
    if (createdAt) where.createdAt = createdAt;

    return this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        protocol: true,
        dailyNumber: true,
        status: true,
        customerName: true,
        customerPhone: true,
        addressStreet: true,
        addressNumber: true,
        addressComplement: true,
        addressNeighborhood: true,
        addressReference: true,
        courierFeeCents: true,
        notes: true,
        createdAt: true,
        channel: true,
        externalId: true,
        neighborhood: { select: { name: true } },
        items: {
          select: {
            id: true,
            nameSnapshot: true,
            optionNameSnapshot: true,
            quantity: true,
            notes: true,
          },
        },
      },
    });
  }

  /**
   * Soma dos repasses a entregadores no período p/ o DRE.
   * Mantém ativo o repasse mesmo se o pedido foi cancelado após o entregador
   * ter saído para o endereço (courierId preenchido).
   */
  async courierCostCents(from?: string, to?: string): Promise<number> {
    const createdAt = periodFilter(from, to);
    const agg = await this.prisma.order.aggregate({
      where: {
        courierId: { not: null },
        OR: [
          this.paidWhere(from, to),
          {
            status: OrderStatus.CANCELED,
            ...(createdAt ? { createdAt } : {}),
          },
        ],
      },
      _sum: { courierFeeCents: true },
    });
    return agg._sum.courierFeeCents ?? 0;
  }

  /** Pedidos e faturamento por canal (próprio/iFood/Gami). */
  async byChannel(from?: string, to?: string) {
    return this.cached(`byChannel:${from ?? ''}:${to ?? ''}`, async () => {
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
    });
  }

  /** Itens mais vendidos no período (por quantidade). */
  async topItems(from?: string, to?: string, limit = 10) {
    const groups = await this.getGroupedOrderItems(from, to);

    const map = new Map<string, { quantity: number; totalCents: number }>();
    for (const g of groups) {
      const qty = g._sum.quantity ?? 0;
      const bucket = map.get(g.nameSnapshot) ?? { quantity: 0, totalCents: 0 };
      bucket.quantity += qty;
      bucket.totalCents += g.priceCents * qty;
      map.set(g.nameSnapshot, bucket);
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
    const [byChannel, config, cmvCents, courierCents, expenseGroups, discountAgg] =
      await Promise.all([
        this.byChannel(from, to),
        this.channelConfig(),
        this.cmvCents(from, to),
        this.courierCostCents(from, to),
        this.prisma.expense.groupBy({
          by: ['categoryId'],
          where: dueDate ? { dueDate } : {},
          _sum: { amountCents: true },
        }),
        this.prisma.order.aggregate({
          where: this.paidWhere(from, to),
          _sum: { discountCents: true },
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

    const discountCents = discountAgg._sum.discountCents ?? 0;
    const netCents =
      grossCents - commissionCents - cmvCents - courierCents - expensesCents;
    return {
      from,
      to,
      grossCents,
      discountCents,
      grossByChannel,
      commissionCents,
      cmvCents,
      courierCents,
      expensesByCategory,
      expensesCents,
      netCents,
    };
  }

  /**
   * Despesas não pagas com vencimento nos próximos `days` dias (a partir de
   * hoje), ordenadas por data de vencimento. Usado no calendário de projeção.
   */
  async upcomingExpenses(days = 30) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const until = new Date(today);
    until.setDate(until.getDate() + days);

    return this.prisma.expense.findMany({
      where: {
        paidAt: null,
        dueDate: { gte: today, lte: until },
      },
      orderBy: { dueDate: 'asc' },
      include: {
        category: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
      },
    });
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
