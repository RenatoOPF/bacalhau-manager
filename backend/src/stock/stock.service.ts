import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  MenuItem,
  MenuItemOption,
  Order,
  OrderItem,
  StockLink,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStockItemDto,
  CreateStockLinkDto,
  ProduceDto,
  UpdateStockItemDto,
  UpdateStockLinkDto,
} from './dto/stock.dto';

type OptionWithLinks = MenuItemOption & { stockLinks: StockLink[] };
type MenuItemFull = MenuItem & {
  options: OptionWithLinks[];
  stockLinks: StockLink[];
};
type OrderWithItems = Order & { items: OrderItem[] };

/** Normaliza para casamento por texto: minúsculas, sem acento, espaços únicos. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fator de tamanho deduzido do texto: "meia porção"/"individual" = 0.5,
 * "porção inteira"/"inteira" = 1. Null se não reconhecer.
 */
function sizeFactor(normalized: string): number | null {
  if (/\b(meia porcao|individual)\b/.test(normalized)) return 0.5;
  if (/\b(porcao inteira|inteira)\b/.test(normalized)) return 1;
  return null;
}

// Saldos e consumos são guardados em MILÉSIMOS da unidade do insumo
// (3,5 porções = 3500; 1,2 kg = 1200) — inteiro, sem fração no banco.
const toMilli = (qty: number) => Math.round(qty * 1000);
const fromMilli = (milli: number) => milli / 1000;

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---- CRUD de insumos ----

  async list() {
    const items = await this.prisma.stockItem.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { links: true } } },
    });
    return items.map((s) => ({
      id: s.id,
      name: s.name,
      unit: s.unit,
      qty: fromMilli(s.qtyMilli),
      alertQty: fromMilli(s.alertMilli),
      active: s.active,
      linkedCount: s._count.links,
    }));
  }

  async create(dto: CreateStockItemDto) {
    const qtyMilli = toMilli(dto.qty ?? 0);
    const item = await this.prisma.stockItem.create({
      data: {
        name: dto.name.trim(),
        unit: dto.unit ?? 'porção',
        qtyMilli,
        alertMilli: toMilli(dto.alertQty ?? 2),
      },
    });
    if (qtyMilli !== 0) {
      await this.prisma.stockMovement.create({
        data: {
          stockItemId: item.id,
          deltaMilli: qtyMilli,
          reason: 'Estoque inicial',
        },
      });
    }
    return item;
  }

  async update(id: string, dto: UpdateStockItemDto) {
    const item = await this.prisma.stockItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Insumo não encontrado');
    if (dto.setQty !== undefined && dto.deltaQty !== undefined) {
      throw new BadRequestException('Use setQty OU deltaQty, não os dois.');
    }

    let delta = 0;
    let reason = '';
    if (dto.setQty !== undefined) {
      delta = toMilli(dto.setQty) - item.qtyMilli;
      reason = 'Contagem/ajuste manual';
    } else if (dto.deltaQty !== undefined) {
      delta = toMilli(dto.deltaQty);
      reason = delta >= 0 ? 'Reposição' : 'Baixa manual';
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.stockItem.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
          ...(dto.alertQty !== undefined
            ? { alertMilli: toMilli(dto.alertQty) }
            : {}),
          ...(delta !== 0 ? { qtyMilli: { increment: delta } } : {}),
        },
      }),
      ...(delta !== 0
        ? [
            this.prisma.stockMovement.create({
              data: { stockItemId: id, deltaMilli: delta, reason },
            }),
          ]
        : []),
    ]);
    return updated;
  }

  async remove(id: string) {
    await this.prisma.stockItem.delete({ where: { id } });
    return { id };
  }

  /** Últimas movimentações do insumo (auditoria). */
  async movements(id: string) {
    const rows = await this.prisma.stockMovement.findMany({
      where: { stockItemId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((m) => ({
      id: m.id,
      deltaQty: fromMilli(m.deltaMilli),
      reason: m.reason,
      orderId: m.orderId,
      createdAt: m.createdAt,
    }));
  }

  // ---- Produção (conversão manual, ex.: kg de bacalhau → porções) ----

  /**
   * Registra uma produção: baixa `fromQty` do insumo de origem (ex.: 1 kg de
   * "Bacalhau (kg)") e credita `toQty` no destino (ex.: 3 porções de
   * "Bacalhau Desfiado"). As duas movimentações citam o par para auditoria.
   */
  async produce(dto: ProduceDto) {
    if (dto.fromId === dto.toId) {
      throw new BadRequestException('Origem e destino devem ser diferentes.');
    }
    const [from, to] = await Promise.all([
      this.prisma.stockItem.findUnique({ where: { id: dto.fromId } }),
      this.prisma.stockItem.findUnique({ where: { id: dto.toId } }),
    ]);
    if (!from || !to) throw new NotFoundException('Insumo não encontrado');

    const fromMilliQty = toMilli(dto.fromQty);
    const toMilliQty = toMilli(dto.toQty);
    if (fromMilliQty <= 0 || toMilliQty <= 0) {
      throw new BadRequestException('Quantidades devem ser maiores que zero.');
    }

    const fmt = (m: number) => fromMilli(m).toLocaleString('pt-BR');
    await this.prisma.$transaction([
      this.prisma.stockItem.update({
        where: { id: from.id },
        data: { qtyMilli: { decrement: fromMilliQty } },
      }),
      this.prisma.stockMovement.create({
        data: {
          stockItemId: from.id,
          deltaMilli: -fromMilliQty,
          reason: `Produção → ${to.name} (${fmt(toMilliQty)} ${to.unit})`,
        },
      }),
      this.prisma.stockItem.update({
        where: { id: to.id },
        data: { qtyMilli: { increment: toMilliQty } },
      }),
      this.prisma.stockMovement.create({
        data: {
          stockItemId: to.id,
          deltaMilli: toMilliQty,
          reason: `Produção ← ${from.name} (${fmt(fromMilliQty)} ${from.unit})`,
        },
      }),
    ]);
    return { produced: true };
  }

  // ---- Vínculos prato/opção → insumo ----

  async createLink(dto: CreateStockLinkDto) {
    if (!dto.menuItemId === !dto.optionId) {
      throw new BadRequestException(
        'Informe exatamente um de menuItemId/optionId.',
      );
    }
    return this.prisma.stockLink.create({
      data: {
        stockItemId: dto.stockItemId,
        menuItemId: dto.menuItemId ?? null,
        optionId: dto.optionId ?? null,
        qtyMilli: toMilli(dto.qty ?? 1),
      },
    });
  }

  async updateLink(id: string, dto: UpdateStockLinkDto) {
    return this.prisma.stockLink.update({
      where: { id },
      data: { qtyMilli: toMilli(dto.qty) },
    });
  }

  async removeLink(id: string) {
    await this.prisma.stockLink.delete({ where: { id } });
    return { id };
  }

  // ---- Consumo / estorno por pedido ----

  /**
   * Desconta o estoque dos itens do pedido. Nunca lança: falha de estoque não
   * pode impedir a criação do pedido (só registra no log).
   */
  async consumeForOrder(order: OrderWithItems): Promise<void> {
    try {
      const totals = await this.resolveOrderConsumption(order.items);
      if (totals.size === 0) return;

      await this.prisma.$transaction(
        [...totals.entries()].flatMap(([stockItemId, milli]) => [
          this.prisma.stockItem.update({
            where: { id: stockItemId },
            data: { qtyMilli: { decrement: milli } },
          }),
          this.prisma.stockMovement.create({
            data: {
              stockItemId,
              deltaMilli: -milli,
              reason: `Venda pedido #${order.protocol}`,
              orderId: order.id,
            },
          }),
        ]),
      );
      this.logger.log(
        `Estoque baixado para o pedido #${order.protocol} (${totals.size} insumo(s)).`,
      );
    } catch (err) {
      this.logger.error(
        `Falha ao baixar estoque do pedido #${order.protocol}: ${String(err)}`,
      );
    }
  }

  /**
   * Estorna o estoque de um pedido cancelado/excluído. Idempotente: devolve
   * apenas o saldo líquido das movimentações do pedido (chamar duas vezes não
   * duplica o estorno). Nunca lança.
   */
  async restoreForOrder(orderId: string, label: string): Promise<void> {
    try {
      const grouped = await this.prisma.stockMovement.groupBy({
        by: ['stockItemId'],
        where: { orderId },
        _sum: { deltaMilli: true },
      });
      const pending = grouped.filter((g) => (g._sum.deltaMilli ?? 0) !== 0);
      if (pending.length === 0) return;

      await this.prisma.$transaction(
        pending.flatMap((g) => {
          const net = g._sum.deltaMilli ?? 0;
          return [
            this.prisma.stockItem.update({
              where: { id: g.stockItemId },
              data: { qtyMilli: { increment: -net } },
            }),
            this.prisma.stockMovement.create({
              data: {
                stockItemId: g.stockItemId,
                deltaMilli: -net,
                reason: label,
                orderId,
              },
            }),
          ];
        }),
      );
      this.logger.log(`Estoque estornado (${label}).`);
    } catch (err) {
      this.logger.error(`Falha ao estornar estoque (${label}): ${String(err)}`);
    }
  }

  /**
   * Resolve quanto cada insumo é consumido pelos itens do pedido (em milésimos
   * da unidade de cada insumo). Itens próprios usam o vínculo direto
   * (menuItemId); itens externos (iFood) são casados por texto normalizado.
   *
   * Regras: vínculos da opção valem tal como estão (a opção já embute o
   * tamanho); vínculos do item valem por Porção Inteira — Meia desconta metade
   * (fator deduzido do texto da opção/notes).
   */
  private async resolveOrderConsumption(
    items: OrderItem[],
  ): Promise<Map<string, number>> {
    const menuItems = (await this.prisma.menuItem.findMany({
      include: {
        options: { include: { stockLinks: true } },
        stockLinks: true,
      },
    })) as MenuItemFull[];
    const byId = new Map(menuItems.map((m) => [m.id, m]));
    const byName = new Map(menuItems.map((m) => [normalize(m.name), m]));

    const totals = new Map<string, number>();
    const add = (stockItemId: string, milli: number) => {
      if (milli <= 0) return;
      totals.set(stockItemId, (totals.get(stockItemId) ?? 0) + milli);
    };

    for (const item of items) {
      const menuItem = item.menuItemId
        ? byId.get(item.menuItemId)
        : this.matchByText(item.nameSnapshot, byName);
      if (!menuItem) {
        this.logger.warn(
          `Estoque: item "${item.nameSnapshot}" sem correspondência no cardápio.`,
        );
        continue;
      }

      // Contexto textual onde procurar proteína/tamanho (itens iFood trazem
      // isso no nome ou nas notes; itens próprios na opção escolhida).
      const context = normalize(
        [item.nameSnapshot, item.optionNameSnapshot, item.notes]
          .filter(Boolean)
          .join(' '),
      );

      const option = this.matchOption(menuItem.options, item, context);
      if (option && option.stockLinks.length > 0) {
        // A opção já embute o tamanho — consumo exato do vínculo.
        for (const link of option.stockLinks) {
          add(link.stockItemId, link.qtyMilli * item.quantity);
        }
        continue;
      }

      if (menuItem.stockLinks.length === 0) continue;
      // Vínculo do item: qty é por Inteira; Meia desconta metade. Sem tamanho
      // no texto, itens sem opções consomem o vínculo exato (fator 1).
      const factor = sizeFactor(context) ?? 1;
      for (const link of menuItem.stockLinks) {
        add(
          link.stockItemId,
          Math.round(link.qtyMilli * factor) * item.quantity,
        );
      }
    }
    return totals;
  }

  /** Casa um nome vindo do iFood com um item do cardápio (texto normalizado). */
  private matchByText(
    nameSnapshot: string,
    byName: Map<string, MenuItemFull>,
  ): MenuItemFull | undefined {
    const name = normalize(nameSnapshot);
    if (byName.has(name)) return byName.get(name);

    // Sem o sufixo de tamanho embutido ("Frango a Parmegiana Individual").
    const stripped = name
      .replace(/\s*[-–]?\s*(meia porcao|porcao inteira|individual|inteira|unico)$/, '')
      .trim();
    if (stripped !== name && byName.has(stripped)) return byName.get(stripped);

    // Sem o complemento após " - " ("Executivo de peixe grelhado - Tilapia").
    const beforeDash = name.split(' - ')[0].trim();
    if (beforeDash !== name && byName.has(beforeDash))
      return byName.get(beforeDash);

    return undefined;
  }

  /**
   * Escolhe a opção do item que melhor casa com o pedido: pelo nome exato
   * (pedidos próprios) ou pela opção com mais palavras presentes no contexto
   * (ex.: "tilapia porcao inteira" prefere "Tilápia Porção Inteira" a
   * "Tilápia Meia Porção").
   */
  private matchOption(
    options: OptionWithLinks[],
    item: OrderItem,
    context: string,
  ): OptionWithLinks | undefined {
    if (item.optionNameSnapshot) {
      const exact = options.find(
        (o) => normalize(o.name) === normalize(item.optionNameSnapshot!),
      );
      if (exact) return exact;
    }

    let best: OptionWithLinks | undefined;
    let bestScore = 0;
    for (const o of options) {
      const words = normalize(o.name).split(' ').filter(Boolean);
      const hits = words.filter((w) => context.includes(w)).length;
      // Exige que todas as palavras casem (evita "Tilápia X" casar só por "porcao").
      if (hits === words.length && hits > bestScore) {
        best = o;
        bestScore = hits;
      }
    }
    return best;
  }
}
