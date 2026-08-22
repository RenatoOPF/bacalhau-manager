import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OrderChannel, PaymentMethod, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  ORDERS_QUEUE,
  PRINT_CASHIER_JOB,
  PRINT_KITCHEN_JOB,
  PrintOrderJobData,
} from '../queue/queue.constants';
import { nextDailyNumber } from '../common/daily-number';
import { decodeEscPosBase64, toLines } from './escpos';
import { isIfood, parseIfood } from './ifood.parser';
import { isNoventa_Nove, parseNoventa_Nove } from './noventa-nove.parser';
import { ParsedExternalOrder, ParsedExternalItem, brlToCents } from './parsed-order';
import { StockService } from '../stock/stock.service';
import { PrintConfigService } from '../printing/print-config.service';

export type IngestResult =
  | { status: 'created'; protocol: number; channel: string }
  | { status: 'duplicate'; protocol: number }
  | { status: 'unrecognized' };

/** Remove acentos e converte para minúsculas para comparação flexível de nomes. */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Substrings que indicam tamanho/opção — complemento que as contiver vira optionName. */
const SIZE_KEYWORDS = ['meia', 'inteira', 'porcao', 'individual', 'unico'];

function isSizeName(name: string): boolean {
  const lc = normalize(name);
  return SIZE_KEYWORDS.some((kw) => lc.includes(kw));
}

/**
 * Expande cada item da comanda: extrai os complementos das `notes` (formato
 * "N Nome | N Nome | Obs: texto") e os transforma em `ParsedExternalItem`
 * independentes.
 *
 * — Segmentos de tamanho ("Meia Porcao", "Porcao Inteira"…) viram `optionName`
 *   do item principal (não são duplicados como linha separada).
 * — Demais segmentos numéricos viram itens próprios com a quantidade exata
 *   da nota (o iFood/99 já envia o total, não por-item) e priceCents = 0
 *   (o valor já está embutido no item principal).
 * — Linhas "Obs:" permanecem nas notes do item principal.
 */
function expandComplements(items: ParsedExternalItem[]): ParsedExternalItem[] {
  const result: ParsedExternalItem[] = [];

  for (const item of items) {
    if (!item.notes) {
      result.push(item);
      continue;
    }

    const obsLines: string[] = [];
    let optionName: string | undefined;
    const complements: ParsedExternalItem[] = [];

    for (const seg of item.notes.split(' | ')) {
      const trimmed = seg.trim();
      if (!trimmed) continue;

      if (/^obs:/i.test(trimmed)) {
        obsLines.push(trimmed);
        continue;
      }

      // Tenta extrair preço da linha: "N Nome R$XX,XX" (iFood inclui preços nos complementos).
      const mPriced = trimmed.match(/^(\d+)\s+(.+?)\s+R\$\s*([\d.,]+)\s*$/);
      const m = mPriced ?? trimmed.match(/^(\d+)\s+(.+)$/);
      if (!m) {
        obsLines.push(trimmed);
        continue;
      }

      const qty = Number(m[1]);
      const name = m[2].trim();
      // O preço impresso é o total da linha; divide pela qty para obter o unitário.
      const unitCents = mPriced ? Math.round(brlToCents(mPriced[3]) / qty) : 0;

      if (isSizeName(name)) {
        // Tamanho do item principal — só guardamos o nome, a qty é irrelevante.
        optionName = name;
      } else {
        complements.push({
          quantity: qty,
          name,
          priceCents: unitCents,
          optionName: null,
          notes: null,
        });
      }
    }

    result.push({
      ...item,
      optionName: optionName ?? item.optionName ?? null,
      notes: obsLines.join(' | ') || null,
    });

    result.push(...complements);
  }

  return result;
}

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly stock: StockService,
    private readonly printConfig: PrintConfigService,
    @InjectQueue(ORDERS_QUEUE)
    private readonly ordersQueue: Queue<PrintOrderJobData>,
  ) {}

  /**
   * Constrói um estimador de preço de venda baseado no nosso cardápio.
   * Usa match exato pelo nome normalizado e, como fallback, match por prefixo
   * (útil para "Coca Zero Lata - 350ml" → "Coca Zero Lata" no cadastro).
   * Quando o item tem opções (tamanhos), retorna o priceCents da opção
   * correspondente; caso contrário usa o priceCents do item.
   */
  private async buildPriceEstimator(): Promise<
    (name: string, optionName: string | null) => number
  > {
    const items = await this.prisma.menuItem.findMany({
      select: {
        name: true,
        priceCents: true,
        options: { select: { name: true, priceCents: true } },
      },
    });

    const byName = new Map(items.map((i) => [normalize(i.name), i]));

    const match = (name: string) => {
      const norm = normalize(name);
      if (byName.has(norm)) return byName.get(norm)!;
      let best: (typeof items)[0] | undefined;
      let bestLen = 0;
      for (const [menuName, item] of byName) {
        if (menuName.length > bestLen && norm.startsWith(menuName)) {
          best = item;
          bestLen = menuName.length;
        }
      }
      return best;
    };

    return (name, optionName) => {
      const item = match(name);
      if (!item) return 0;
      if (optionName && item.options.length > 0) {
        const normOpt = normalize(optionName);
        const opt = item.options.find((o) => normalize(o.name) === normOpt);
        if (opt) return opt.priceCents;
      }
      return item.priceCents;
    };
  }

  /** Recebe o base64 de uma impressão capturada, parseia e cria o pedido. */
  async ingestCapture(rawBase64: string): Promise<IngestResult> {
    const lines = toLines(decodeEscPosBase64(rawBase64));

    let parsed: ParsedExternalOrder | null = null;
    if (isIfood(lines)) parsed = parseIfood(lines);
    else if (isNoventa_Nove(lines)) parsed = parseNoventa_Nove(lines);

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

    const channelLabel =
      parsed.channel === OrderChannel.IFOOD ? 'iFood' : '99';
    const dailyNumber = await nextDailyNumber(this.prisma);
    const [costOf, priceOf] = await Promise.all([
      this.stock.buildCostEstimator(),
      this.buildPriceEstimator(),
    ]);
    const expandedItems = expandComplements(parsed.items);
    // Sobrescreve os preços com os do nosso cardápio quando há correspondência.
    for (const it of expandedItems) {
      const menuPrice = priceOf(it.name, it.optionName ?? null);
      if (menuPrice > 0) it.priceCents = menuPrice;
    }

    // Tenta vincular o bairro do texto ao cadastro (sem acento, sem case).
    let neighborhoodId: string | null = null;
    if (parsed.addressNeighborhood) {
      const normalizedTarget = normalize(parsed.addressNeighborhood);
      const neighborhoods = await this.prisma.neighborhood.findMany({
        where: { active: true },
        select: { id: true, name: true },
      });
      const match =
        neighborhoods.find((n) => normalize(n.name) === normalizedTarget) ??
        neighborhoods.find((n) => {
          const a = normalize(n.name);
          return a.includes(normalizedTarget) || normalizedTarget.includes(a);
        });
      if (match) {
        neighborhoodId = match.id;
        this.logger.log(
          `Bairro "${parsed.addressNeighborhood}" vinculado ao cadastro "${match.name}".`,
        );
      } else {
        this.logger.warn(
          `Bairro "${parsed.addressNeighborhood}" não encontrado no cadastro.`,
        );
      }
    }

    const order = await this.prisma.order.create({
      data: {
        dailyNumber,
        channel: parsed.channel,
        externalId: parsed.externalId,
        customerName: parsed.customerName || 'Cliente',
        customerPhone: parsed.customerPhone,
        addressStreet: parsed.addressStreet || '-',
        addressComplement: parsed.addressComplement,
        addressNeighborhood: parsed.addressNeighborhood,
        addressReference: parsed.addressReference,
        neighborhoodId,
        paymentMethod: PaymentMethod.ONLINE,
        paymentStatus: parsed.paidOnline
          ? PaymentStatus.PAID
          : PaymentStatus.PENDING,
        paidAt: parsed.paidOnline ? new Date() : null,
        totalCents: parsed.totalCents,
        deliveryFeeCents: parsed.deliveryFeeCents,
        // Referência exibida na comanda (ex.: "iFood #8156"). O localizador
        // fica no externalId (dedup), não precisa poluir a nota.
        notes: parsed.shortNumber
          ? `${channelLabel} #${parsed.shortNumber}`
          : `${channelLabel} · Loc ${parsed.externalId}`,
        items: {
          create: expandedItems.map((it) => ({
            menuItemId: null,
            nameSnapshot: it.name,
            optionNameSnapshot: it.optionName ?? null,
            priceCents: it.priceCents,
            unitCostCents: costOf(it.name, it.optionName ?? null, it.notes ?? null),
            quantity: it.quantity,
            notes: it.notes ?? null,
          })),
        },
      },
      include: { items: true },
    });

    if (this.printConfig.isEnabled()) {
      await this.ordersQueue.add(PRINT_CASHIER_JOB, { orderId: order.id });
      await this.ordersQueue.add(PRINT_KITCHEN_JOB, { orderId: order.id });
    }

    // Baixa o estoque casando os itens por texto (nunca lança).
    await this.stock.consumeForOrder(order);

    this.realtime.emitOrderCreated(order);
    this.logger.log(
      `Pedido ${parsed.channel} criado (#${order.protocol}, ${expandedItems.length} linha(s), ${parsed.items.length} item(ns) original(is)).`,
    );
    return { status: 'created', protocol: order.protocol, channel: parsed.channel };
  }
}
