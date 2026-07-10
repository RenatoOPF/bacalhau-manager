import { Injectable, Logger } from '@nestjs/common';
import {
  printer as ThermalPrinter,
  types as PrinterTypes,
} from 'node-thermal-printer';
import type { Order, OrderItem } from '@prisma/client';

type OrderWithItems = Order & { items: OrderItem[] };

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
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
    p.println(`Pedido #${order.protocol}`);
    p.drawLine();
    p.alignLeft();
    p.println(`Cliente: ${order.customerName}`);
    if (order.customerPhone) p.println(`Tel: ${order.customerPhone}`);
    p.println('Endereço:');
    p.println(
      `  ${order.addressStreet}${order.addressNumber ? ', ' + order.addressNumber : ''}`,
    );
    if (order.addressComplement) p.println(`  ${order.addressComplement}`);
    if (order.addressNeighborhood) p.println(`  ${order.addressNeighborhood}`);
    if (order.addressReference) p.println(`  Ref: ${order.addressReference}`);
    p.drawLine();
    for (const item of order.items) {
      // Nome do item sempre em MAIÚSCULAS no ticket (o cardápio guarda em Título).
      p.println(`${item.quantity}x ${item.nameSnapshot.toUpperCase()}`);
      if (item.notes) p.println(`   obs: ${item.notes}`);
      p.alignRight();
      p.println(formatBRL(item.priceCents * item.quantity));
      p.alignLeft();
    }
    p.drawLine();
    p.bold(true);
    p.println(`TOTAL: ${formatBRL(order.totalCents)}`);
    p.bold(false);
    p.println(`Pagamento: ${order.paymentMethod} (${order.paymentStatus})`);
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
    p.alignCenter();
    p.bold(true);
    p.setTextDoubleHeight();
    p.println(`PEDIDO #${order.protocol}`);
    p.setTextNormal();
    p.bold(false);
    p.println(new Date(order.createdAt).toLocaleTimeString('pt-BR'));
    p.drawLine();
    p.alignLeft();
    for (const item of order.items) {
      p.bold(true);
      // Nome do item sempre em MAIÚSCULAS no ticket (o cardápio guarda em Título).
      p.println(`${item.quantity}x ${item.nameSnapshot.toUpperCase()}`);
      p.bold(false);
      if (item.notes) p.println(`   >> ${item.notes}`);
    }
    if (order.notes) {
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
