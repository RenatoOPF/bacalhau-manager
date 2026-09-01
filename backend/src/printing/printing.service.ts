import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import {
  printer as ThermalPrinter,
  types as PrinterTypes,
  CharacterSet,
} from 'node-thermal-printer';
import { OrderChannel } from '@prisma/client';
import type { Order, OrderItem } from '@prisma/client';
import { toPrintOption, formatItemNote } from './printing-utils';

type OrderWithItems = Order & { items: OrderItem[] };

function formatBRL(cents: number): string {
  return (cents / 100)
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    .replace(/ /g, ' ');
}

/** Extrai mensagem legível de qualquer tipo de erro lançado pelo node-thermal-printer. */
function errMsg(e: unknown): string {
  if (!e) return 'unknown';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message || e.toString();
  return String(e);
}

/**
 * Quebra o texto em linhas de no máximo `width` colunas SEM cortar palavra no
 * meio: cada palavra fica inteira numa linha; se não couber no que resta, vai
 * para a linha de baixo. (O papel térmico, sem isso, corta a palavra no limite
 * da coluna.) Uma palavra maior que a largura fica sozinha na linha.
 */
function wrapWords(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!line) {
      line = word;
    } else if (line.length + 1 + word.length <= width) {
      line += ' ' + word;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

const NAME_PARTICLES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'von', 'van']);

function firstTwoNames(name: string): string {
  const words = name.trim().split(/\s+/);
  const result: string[] = [];
  let count = 0;
  for (const word of words) {
    result.push(word);
    if (!NAME_PARTICLES.has(word.toLowerCase())) count++;
    if (count === 2) break;
  }
  return result.join(' ');
}

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'PIX',
  ONLINE: 'Online',
};

/** Forma de pagamento legível, ex.: "Online (pago)". */
function prettyPayment(method: string, status: string): string {
  const m = PAYMENT_LABEL[method] ?? method;
  return `${m} (${status === 'PAID' ? 'pago' : 'pendente'})`;
}

/** Data e hora do pedido, ex.: "14/07/2026 11:49" (hora local do caixa). */
function formatDateTime(date: Date): string {
  const d = new Date(date);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/**
 * Impressão dos tickets via ESC/POS. As duas impressoras são acionadas
 * pelo PC do caixa (ponto central de impressão).
 *
 * Se a interface não estiver configurada no .env, a impressão é apenas
 * logada — permite desenvolver sem hardware. A confiabilidade de reenvio
 * fica a cargo da fila (BullMQ): lançar erro aqui dispara o retry.
 */
@Injectable()
export class PrintingService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PrintingService.name);
  private readonly width = Number(process.env.PRINTER_WIDTH ?? 32);
  private readonly keepaliveTimers: NodeJS.Timeout[] = [];

  // DLE EOT 1 — consulta de status em tempo real: não avança papel nem altera estado.
  private static readonly KEEPALIVE_CMD = Buffer.from([0x10, 0x04, 0x01]);
  private static readonly KEEPALIVE_INTERVAL_MS = 9 * 60 * 1000; // 9 min < 10 min de auto-off

  onApplicationBootstrap() {
    // Keep-alive para impressoras Bluetooth (auto-off em 10 min).
    // USB não precisa — só Bluetooth desliga sozinha por inatividade.
    const interfaces = [
      process.env.PRINTER_CASHIER_INTERFACE,
    ].filter(Boolean) as string[];

    if (interfaces.length === 0) return;

    for (const iface of interfaces) {
      // Aguarda 30s antes do primeiro pulso para a impressora estar pronta.
      const initial = setTimeout(() => this.sendKeepalive(iface), 30_000);
      const recurring = setInterval(() => this.sendKeepalive(iface), PrintingService.KEEPALIVE_INTERVAL_MS);
      this.keepaliveTimers.push(initial, recurring);
    }

    this.logger.log(
      `[KEEPALIVE] iniciado para impressora do caixa (Bluetooth, intervalo: 8 min)`,
    );
  }

  onApplicationShutdown() {
    for (const t of this.keepaliveTimers) clearTimeout(t);
  }

  private async sendKeepalive(iface: string): Promise<void> {
    try {
      const p = this.buildPrinter(iface);
      p.raw(PrintingService.KEEPALIVE_CMD);
      await p.execute();
      this.logger.debug(`[KEEPALIVE] pulso enviado para ${iface}`);
    } catch (e: any) {
      this.logger.warn(`[KEEPALIVE] falhou para ${iface}: ${e?.message ?? e}`);
    }
  }

  private buildPrinter(interfaceUrl: string): ThermalPrinter {
    return new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: interfaceUrl,
      width: this.width,
      removeSpecialCharacters: false,
      characterSet: CharacterSet.PC860_PORTUGUESE,
    });
  }

  /** Ticket do caixa: itens + endereço + pagamento + total. */
  async printCashierTicket(order: OrderWithItems): Promise<void> {
    const iface = process.env.PRINTER_CASHIER_INTERFACE;
    if (!iface) {
      this.logger.warn(
        `[CAIXA] impressão simulada do pedido #${order.protocol} (sem PRINTER_CASHIER_INTERFACE)`,
      );
      return;
    }

    const p = this.buildPrinter(iface);
    p.alignCenter();
    p.bold(true);
    p.println('BACALHAU & CIA');
    p.bold(false);
    p.println(`Pedido #${order.dailyNumber}`);
    // Pedido externo: referência do canal (ex.: "iFood #8156").
    if (order.channel !== OrderChannel.OWN && order.notes) {
      p.println(order.notes);
    }
    p.println(formatDateTime(order.createdAt));
    p.drawLine();
    p.alignLeft();
    for (const line of wrapWords(`Cliente: ${firstTwoNames(order.customerName)}`, this.width)) {
      p.println(line);
    }
    if (order.customerPhone) p.println(`Tel: ${order.customerPhone}`);
    const address = [
      `${order.addressStreet}${order.addressNumber ? ', ' + order.addressNumber : ''}`,
      order.addressComplement,
      order.addressNeighborhood,
      order.addressReference,
    ]
      .filter(Boolean)
      .join(' ');
    for (const line of wrapWords(`Endereço: ${address}`, this.width)) {
      p.println(line);
    }
    p.drawLine();
    for (const item of order.items) {
      // Nome (+ opção) em MAIÚSCULAS; opção no termo da cozinha (Individual/Inteira).
      // Pedidos iFood não têm optionNameSnapshot — a opção vem embutida no nome.
      const label = item.optionNameSnapshot
        ? `${item.nameSnapshot} (${toPrintOption(item.optionNameSnapshot)})`
        : toPrintOption(item.nameSnapshot);
      for (const line of wrapWords(`${item.quantity}x ${label.toUpperCase()}`, this.width)) {
        p.println(line);
      }
      if (item.notes) {
        for (const segment of formatItemNote(item.notes)) {
          for (const line of wrapWords(segment, this.width)) {
            p.println(line);
          }
        }
      }
      p.alignRight();
      p.println(formatBRL(item.priceCents * item.quantity));
      p.alignLeft();
    }
    p.drawLine();
    if (order.deliveryFeeCents > 0) {
      p.println(`Taxa de entrega: ${formatBRL(order.deliveryFeeCents)}`);
    }
    p.bold(true);
    p.println(`TOTAL: ${formatBRL(order.totalCents)}`);
    p.bold(false);
    p.println(
      `Pagamento: ${prettyPayment(order.paymentMethod, order.paymentStatus)}`,
    );
    p.cut();

    await this.execute(p, 'CAIXA', order.protocol);
  }

  /** Ticket da cozinha: número + itens + observações. NUNCA inclui endereço. */
  async printKitchenTicket(order: OrderWithItems): Promise<void> {
    const iface1 = process.env.PRINTER_KITCHEN_INTERFACE;
    if (!iface1) {
      this.logger.warn(
        `[COZINHA] impressão simulada do pedido #${order.protocol} (sem PRINTER_KITCHEN_INTERFACE)`,
      );
      return;
    }

    const interfaces = [iface1, process.env.PRINTER_KITCHEN_INTERFACE_2].filter(Boolean) as string[];
    const results = await Promise.allSettled(
      interfaces.map((iface, idx) => {
        const p = this.buildPrinter(iface);
        this.applyKitchenContent(p, order);
        return this.execute(p, idx === 0 ? 'COZINHA' : 'COZINHA-2', order.protocol);
      }),
    );

    const failures = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    for (const f of failures) {
      this.logger.error(`[COZINHA] falha em uma impressora: ${errMsg(f.reason)}`);
    }
    // Se TODAS as impressoras falharam, propaga o erro para o BullMQ marcar o job como falho.
    if (failures.length === results.length) {
      throw failures[0].reason ?? new Error('[COZINHA] todas as impressoras falharam');
    }
  }

  private applyKitchenContent(p: ThermalPrinter, order: OrderWithItems): void {
    p.alignCenter();
    p.setTextQuadArea();
    for (const line of wrapWords(firstTwoNames(order.customerName).toUpperCase(), Math.floor(this.width / 2))) {
      p.println(line);
    }
    p.setTextNormal();
    p.println(`PEDIDO #${order.dailyNumber}`);
    // Pedido externo: referência do canal (ex.: "iFood #8156").
    if (order.channel !== OrderChannel.OWN && order.notes) {
      p.println(order.notes);
    }
    p.println(new Date(order.createdAt).toLocaleTimeString('pt-BR'));
    p.drawLine();
    p.alignLeft();
    p.setTextDoubleWidth();
    const wideWidth = 16;
    for (const item of order.items) {
      const label = item.optionNameSnapshot
        ? `${item.nameSnapshot} (${toPrintOption(item.optionNameSnapshot)})`.toUpperCase()
        : toPrintOption(item.nameSnapshot).toUpperCase();
      for (const line of wrapWords(`${item.quantity}x ${label}`, wideWidth)) {
        p.println(line);
      }
      if (item.notes) {
        for (const segment of formatItemNote(item.notes)) {
          const isOption = segment.startsWith('(');
          if (isOption) {
            for (const line of wrapWords(segment, wideWidth)) {
              p.println(line);
            }
          } else {
            p.setTextNormal();
            for (const line of wrapWords(segment, this.width)) {
              p.println(line);
            }
            p.setTextDoubleWidth();
          }
        }
      }
      p.println('');
    }
    p.setTextNormal();
    // Obs. geral só para pedidos próprios (nos externos a nota é a referência,
    // já mostrada no topo).
    if (order.channel === OrderChannel.OWN && order.notes) {
      p.drawLine();
      p.println(`Obs. geral: ${order.notes}`);
    }
    p.cut();
  }

  private async execute(
    p: ThermalPrinter,
    label: string,
    protocol: number,
  ): Promise<void> {
    // Sem pré-checagem via isPrinterConnected(): para interfaces UNC
    // (//localhost/Nome) ela usa fs.existsSync, que sempre retorna false
    // para compartilhamentos de impressora — falso negativo mesmo com a
    // impressora acessível. p.execute() já rejeita/lança se a escrita
    // falhar, o que a fila (BullMQ) usa pra disparar o retry.
    try {
      await p.execute();
    } catch (e: unknown) {
      // node-thermal-printer às vezes lança objetos sem .message; garantimos
      // uma mensagem legível para que o BullMQ preencha failedReason corretamente.
      throw new Error(`[${label}] falha na impressora (pedido #${protocol}): ${errMsg(e)}`);
    }
    this.logger.log(`[${label}] ticket impresso (pedido #${protocol})`);
  }
}
