import { Injectable, Logger } from '@nestjs/common';
import {
  printer as ThermalPrinter,
  types as PrinterTypes,
  CharacterSet,
} from 'node-thermal-printer';
import { OrderChannel } from '@prisma/client';
import type { Order, OrderItem } from '@prisma/client';

type OrderWithItems = Order & { items: OrderItem[] };

function formatBRL(cents: number): string {
  return (cents / 100)
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    .replace(/\u00a0/g, ' ');
}

/**
 * Converte o nome da opção do cardápio para o termo usado na cozinha/impressão:
 * "Meia Porção" → "Individual", "Porção Inteira" → "Inteira" (inclui os peixes,
 * ex.: "Tilápia Meia Porção" → "Tilápia Individual"). O cardápio do cliente
 * mantém o nome original.
 */
function toPrintOption(name: string): string {
  return name
    .replace(/Meia Por[çc][ãa]o/gi, 'Individual')
    .replace(/Por[çc][ãa]o Inteira/gi, 'Inteira');
}

/** Formata a note de um item iFood: "1 Porcao Inteira" → "(INTEIRA)"; texto livre → "obs: ..." */
function formatItemNote(note: string): string {
  const m = toPrintOption(note).match(/^\d+\s+(Individual|Inteira)$/i);
  if (m) return `(${m[1].toUpperCase()})`;
  return `obs: ${note}`;
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
export class PrintingService {
  private readonly logger = new Logger(PrintingService.name);
  private readonly width = Number(process.env.PRINTER_WIDTH ?? 48);

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
    p.println(`Cliente: ${order.customerName}`);
    if (order.customerPhone) p.println(`Tel: ${order.customerPhone}`);
    // Endereço numa linha só, campos separados por espaço (o papel quebra sozinho).
    const address = [
      `${order.addressStreet}${order.addressNumber ? ', ' + order.addressNumber : ''}`,
      order.addressComplement,
      order.addressNeighborhood,
      order.addressReference,
    ]
      .filter(Boolean)
      .join(' ');
    p.println(`Endereço: ${address}`);
    p.drawLine();
    p.setTextDoubleHeight();
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
        for (const line of wrapWords(formatItemNote(item.notes), this.width)) {
          p.println(line);
        }
      }
      p.alignRight();
      p.println(formatBRL(item.priceCents * item.quantity));
      p.alignLeft();
    }
    p.setTextNormal();
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
    const iface = process.env.PRINTER_KITCHEN_INTERFACE;
    if (!iface) {
      this.logger.warn(
        `[COZINHA] impressão simulada do pedido #${order.protocol} (sem PRINTER_KITCHEN_INTERFACE)`,
      );
      return;
    }

    const p = this.buildPrinter(iface);
    // Sem negrito na cozinha. Ordem: nome do cliente, depois o pedido, depois o resto.
    p.alignCenter();
    p.setTextDoubleHeight();
    p.println(order.customerName.toUpperCase());
    p.setTextNormal();
    p.println(`PEDIDO #${order.dailyNumber}`);
    // Pedido externo: referência do canal (ex.: "iFood #8156").
    if (order.channel !== OrderChannel.OWN && order.notes) {
      p.println(order.notes);
    }
    p.println(new Date(order.createdAt).toLocaleTimeString('pt-BR'));
    p.drawLine();
    p.alignLeft();
    // Itens em fonte maior (dupla altura). Sem o tamanho do prato e quebrando
    // por palavra para não cortar o nome no meio.
    p.setTextDoubleHeight();
    for (const item of order.items) {
      const label = item.optionNameSnapshot
        ? `${item.nameSnapshot} (${toPrintOption(item.optionNameSnapshot)})`.toUpperCase()
        : toPrintOption(item.nameSnapshot).toUpperCase();
      for (const line of wrapWords(`${item.quantity}x ${label}`, this.width)) {
        p.println(line);
      }
      if (item.notes) {
        for (const line of wrapWords(formatItemNote(item.notes), this.width)) {
          p.println(line);
        }
      }
    }
    p.setTextNormal();
    // Obs. geral só para pedidos próprios (nos externos a nota é a referência,
    // já mostrada no topo).
    if (order.channel === OrderChannel.OWN && order.notes) {
      p.drawLine();
      p.println(`Obs. geral: ${order.notes}`);
    }
    p.cut();

    await this.execute(p, 'COZINHA', order.protocol);
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
    await p.execute();
    this.logger.log(`[${label}] ticket impresso (pedido #${protocol})`);
  }
}
