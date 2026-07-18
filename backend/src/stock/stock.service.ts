import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { MenuItem, MenuItemOption, Order, OrderItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStockItemDto, UpdateStockItemDto } from './dto/stock.dto';

type MenuItemWithOptions = MenuItem & { options: MenuItemOption[] };
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
 * Consumo (em meias porções) deduzido do texto: "meia porção"/"individual"
 * desconta 1, "porção inteira"/"inteira" desconta 2. Null se não reconhecer.
 */
function sizeHalfUnits(normalized: string): number | null {
  if (/\b(meia porcao|individual)\b/.test(normalized)) return 1;
  if (/\b(porcao inteira|inteira)\b/.test(normalized)) return 2;
  return null;
}

/** Palavras de tamanho, ignoradas ao casar o nome de uma opção (fica a proteína). */
const SIZE_WORDS = new Set(['meia', 'porcao', 'inteira', 'individual', 'unico']);

const toHalf = (portions: number) => Math.round(portions * 2);
const toPortions = (halfUnits: number) => halfUnits / 2;

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---- CRUD de insumos ----

  async list() {
    const items = await this.prisma.stockItem.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { menuItems: true, options: true } } },
    });
    return items.map((s) => ({
      id: s.id,
      name: s.name,
      portions: toPortions(s.halfUnits),
      alertPortions: toPortions(s.alertHalfUnits),
      active: s.active,
      linkedCount: s._count.menuItems + s._count.options,
    }));
  }

  async create(dto: CreateStockItemDto) {
    const halfUnits = toHalf(dto.portions ?? 0);
    const item = await this.prisma.stockItem.create({
      data: {
        name: dto.name.trim(),
        halfUnits,
        alertHalfUnits: toHalf(dto.alertPortions ?? 2),
      },
    });
    if (halfUnits !== 0) {
      await this.prisma.stockMovement.create({
        data: {
          stockItemId: item.id,
          deltaHalfUnits: halfUnits,
          reason: 'Estoque inicial',
        },
      });
    }
    return item;
  }

  async update(id: string, dto: UpdateStockItemDto) {
    const item = await this.prisma.stockItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Insumo não encontrado');
    if (dto.setPortions !== undefined && dto.deltaPortions !== undefined) {
      throw new BadRequestException(
        'Use setPortions OU deltaPortions, não os dois.',
      );
    }

    let delta = 0;
    let reason = '';
    if (dto.setPortions !== undefined) {
      delta = toHalf(dto.setPortions) - item.halfUnits;
      reason = 'Contagem/ajuste manual';
    } else if (dto.deltaPortions !== undefined) {
      delta = toHalf(dto.deltaPortions);
      reason = delta >= 0 ? 'Reposição' : 'Baixa manual';
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.stockItem.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
          ...(dto.alertPortions !== undefined
            ? { alertHalfUnits: toHalf(dto.alertPortions) }
            : {}),
          ...(delta !== 0 ? { halfUnits: { increment: delta } } : {}),
        },
      }),
      ...(delta !== 0
        ? [
            this.prisma.stockMovement.create({
              data: { stockItemId: id, deltaHalfUnits: delta, reason },
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
      deltaPortions: toPortions(m.deltaHalfUnits),
      reason: m.reason,
      orderId: m.orderId,
      createdAt: m.createdAt,
    }));
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
        [...totals.entries()].flatMap(([stockItemId, halfUnits]) => [
          this.prisma.stockItem.update({
            where: { id: stockItemId },
            data: { halfUnits: { decrement: halfUnits } },
          }),
          this.prisma.stockMovement.create({
            data: {
              stockItemId,
              deltaHalfUnits: -halfUnits,
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
        _sum: { deltaHalfUnits: true },
      });
      const pending = grouped.filter((g) => (g._sum.deltaHalfUnits ?? 0) !== 0);
      if (pending.length === 0) return;

      await this.prisma.$transaction(
        pending.flatMap((g) => {
          const net = g._sum.deltaHalfUnits ?? 0;
          return [
            this.prisma.stockItem.update({
              where: { id: g.stockItemId },
              data: { halfUnits: { increment: -net } },
            }),
            this.prisma.stockMovement.create({
              data: {
                stockItemId: g.stockItemId,
                deltaHalfUnits: -net,
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
   * Resolve quanto cada insumo é consumido pelos itens do pedido.
   * Itens próprios usam o vínculo direto (menuItemId); itens externos (iFood)
   * são casados por texto normalizado com o cardápio.
   */
  private async resolveOrderConsumption(
    items: OrderItem[],
  ): Promise<Map<string, number>> {
    const menuItems = await this.prisma.menuItem.findMany({
      include: { options: true },
    });
    const byId = new Map(menuItems.map((m) => [m.id, m]));
    const byName = new Map(menuItems.map((m) => [normalize(m.name), m]));

    const totals = new Map<string, number>();
    const add = (stockItemId: string | null, halfUnits: number) => {
      if (!stockItemId || halfUnits <= 0) return;
      totals.set(stockItemId, (totals.get(stockItemId) ?? 0) + halfUnits);
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

      let stockItemId = menuItem.stockItemId;
      let halfUnits: number | null = null;

      if (menuItem.options.length > 0) {
        const option = this.matchOption(menuItem.options, item, context);
        if (option?.stockItemId) stockItemId = option.stockItemId;
        halfUnits =
          sizeHalfUnits(context) ??
          (option ? sizeHalfUnits(normalize(option.name)) : null) ??
          2;
      } else {
        halfUnits = sizeHalfUnits(context) ?? menuItem.stockHalfUnits;
      }

      add(stockItemId, halfUnits * item.quantity);
    }
    return totals;
  }

  /** Casa um nome vindo do iFood com um item do cardápio (texto normalizado). */
  private matchByText(
    nameSnapshot: string,
    byName: Map<string, MenuItemWithOptions>,
  ): MenuItemWithOptions | undefined {
    const name = normalize(nameSnapshot);
    if (byName.has(name)) return byName.get(name);

    // Sem o sufixo de tamanho embutido ("Frango a Parmegiana Individual").
    const stripped = name
      .replace(/\s*[-–]?\s*(meia porcao|porcao inteira|individual|inteira|unico)$/,'')
      .trim();
    if (stripped !== name && byName.has(stripped)) return byName.get(stripped);

    // Sem o complemento após " - " ("Executivo de peixe grelhado - Tilapia").
    const beforeDash = name.split(' - ')[0].trim();
    if (beforeDash !== name && byName.has(beforeDash))
      return byName.get(beforeDash);

    return undefined;
  }

  /**
   * Escolhe a opção do item que melhor casa com o pedido: pelo nome exato da
   * opção (pedidos próprios) ou pelas palavras da proteína presentes no texto
   * (ex.: "tilapia" em "Executivo de peixe grelhado - Tilapia").
   */
  private matchOption(
    options: MenuItemOption[],
    item: OrderItem,
    context: string,
  ): MenuItemOption | undefined {
    if (item.optionNameSnapshot) {
      const exact = options.find(
        (o) => normalize(o.name) === normalize(item.optionNameSnapshot!),
      );
      if (exact) return exact;
    }
    return options.find((o) => {
      const words = normalize(o.name)
        .split(' ')
        .filter((w) => w && !SIZE_WORDS.has(w));
      return words.length > 0 && words.every((w) => context.includes(w));
    });
  }
}
