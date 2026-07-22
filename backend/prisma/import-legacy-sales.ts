/**
 * Importa o histórico de VENDAS do sistema antigo (Consumer) para a tabela
 * operacional Order/OrderItem, para alimentar os relatórios (faturamento,
 * canais, ticket médio, pico, curva ABC, margem, comprados juntos).
 *
 * Fonte: dois CSVs gerados dos .xlsx do sistema antigo (via LibreOffice):
 *   libreoffice --headless --convert-to csv --outdir <dir> "<arquivo>.xlsx"
 *   - Pedidos: Código, Data Abertura, Status, Criado por, Cliente, Tipo,
 *              Data Fechamento, Origem, Total
 *   - Itens:   Qtd., Valor Un. Item, Nome Prod, Cod. Ped., ... (uma linha/item)
 *
 * Os pedidos entram como finalizados/pagos com a DATA HISTÓRICA, então não
 * aparecem na fila (filtra createdAt do dia) nem no caixa (paidAt do dia).
 * Não mexe em estoque. externalId = "LEG-<código>" para dedup e para permitir
 * reimportar sem colidir com pedidos reais.
 *
 * Idempotente: --reset apaga os pedidos LEG- antes (cascata nos itens) e
 * reimporta do zero. --dry só analisa e imprime, sem escrever nada.
 *
 * Uso:
 *   npx ts-node prisma/import-legacy-sales.ts <pedidos.csv> <itens.csv> [--dry] [--reset]
 */
import {
  OrderChannel,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
} from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry');
const RESET = process.argv.includes('--reset');
const LEG_PREFIX = 'LEG-';

const CHANNEL_MAP: Record<string, OrderChannel> = {
  iFood: OrderChannel.IFOOD,
  Desktop: OrderChannel.OWN,
  '99Food': OrderChannel.NOVENTA_NOVE,
  'MenuDino App/Site': OrderChannel.OWN,
};

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let f: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') {
        f.push(cur);
        cur = '';
      } else if (c === '\n') {
        f.push(cur);
        rows.push(f);
        f = [];
        cur = '';
      } else if (c === '\r') {
        /* ignora */
      } else cur += c;
    }
  }
  if (cur.length || f.length) {
    f.push(cur);
    rows.push(f);
  }
  return rows;
}

/** "1.234,56" | "49,98" | "30" → centavos (ponto = milhar, vírgula = decimal). */
function brlToCents(s: string): number {
  if (!s) return 0;
  const clean = s.trim().replace(/\./g, '').replace(',', '.');
  const n = Number(clean);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** "22/07/2026 13:45:35" → Date local (hora opcional). */
function parseDate(s: string): Date | null {
  if (!s) return null;
  const m = s
    .trim()
    .match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, d, mo, y, h = '0', mi = '0', se = '0'] = m;
  return new Date(+y, +mo - 1, +d, +h, +mi, +se);
}

function indexer(header: string[]) {
  return (name: string) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`Coluna não encontrada: "${name}"`);
    return i;
  };
}

interface LegacyItem {
  nameSnapshot: string;
  quantity: number;
  priceCents: number;
}

async function main() {
  const [ordersPath, itemsPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!ordersPath || !itemsPath) {
    throw new Error('Uso: import-legacy-sales.ts <pedidos.csv> <itens.csv> [--dry] [--reset]');
  }

  // ---- Pedidos ----
  const P = parseCSV(fs.readFileSync(ordersPath, 'utf8'));
  const ph = P[0];
  const pi = indexer(ph);
  const cCod = pi('Código');
  const cAb = pi('Data Abertura');
  const cStat = pi('Status');
  const cCli = pi('Cliente');
  const cFec = pi('Data Fechamento');
  const cOrig = pi('Origem');
  const cTot = pi('Total');

  type OrderRec = {
    code: string;
    channel: OrderChannel;
    totalCents: number;
    createdAt: Date;
    paidAt: Date;
    customerName: string;
  };
  const orders = new Map<string, OrderRec>();
  let skippedStatus = 0;
  let skippedNoChannel = 0;

  for (let i = 1; i < P.length; i++) {
    const r = P[i];
    if (!r || r.length < 2 || !r[cCod]) continue;
    const status = (r[cStat] || '').trim();
    // Só pedidos finalizados (Pago ou Fiado — Fiado conta como pago).
    if (!status.startsWith('Finalizado')) {
      skippedStatus++;
      continue;
    }
    const channel = CHANNEL_MAP[(r[cOrig] || '').trim()];
    if (!channel) {
      skippedNoChannel++;
      continue;
    }
    const createdAt = parseDate(r[cAb]) ?? new Date();
    const paidAt = parseDate(r[cFec]) ?? createdAt;
    orders.set(r[cCod].trim(), {
      code: r[cCod].trim(),
      channel,
      totalCents: brlToCents(r[cTot]),
      createdAt,
      paidAt,
      customerName: (r[cCli] || '').trim() || 'Cliente',
    });
  }

  // ---- Itens (agrupados por Cod. Ped., pulando "* Excluído *") ----
  const I = parseCSV(fs.readFileSync(itemsPath, 'utf8'));
  const ih = I[0];
  const ii = indexer(ih);
  const iCod = ii('Cod. Ped.');
  const iQtd = ii('Qtd.');
  const iVunit = ii('Valor Un. Item');
  const iNome = ii('Nome Prod');
  const iCat = ii('Cat. Prod.');

  const itemsByOrder = new Map<string, LegacyItem[]>();
  let excluded = 0;
  let fees = 0;
  let itemsNoOrder = 0;
  for (let i = 1; i < I.length; i++) {
    const r = I[i];
    if (!r || r.length < 2) continue;
    const name = (r[iNome] || '').trim();
    if (name.includes('* Excluído *')) {
      excluded++;
      continue;
    }
    // Taxas de entrega eram lançadas como "itens" no sistema antigo; não são
    // produtos. Já estão no total do pedido, então só não viram OrderItem.
    if ((r[iCat] || '').trim() === 'TAXA DE ENTREGA') {
      fees++;
      continue;
    }
    const code = (r[iCod] || '').trim();
    if (!code || !orders.has(code)) {
      itemsNoOrder++;
      continue;
    }
    const list = itemsByOrder.get(code) ?? [];
    list.push({
      nameSnapshot: name.replace(/\s+/g, ' '),
      quantity: Math.max(1, parseInt(r[iQtd], 10) || 1),
      priceCents: brlToCents(r[iVunit]),
    });
    itemsByOrder.set(code, list);
  }

  // ---- Resumo ----
  const validOrders = [...orders.values()].filter((o) => o.totalCents > 0);
  const totalRevenue = validOrders.reduce((s, o) => s + o.totalCents, 0);
  const totalItems = [...itemsByOrder.values()].reduce((s, l) => s + l.length, 0);
  const byChannel: Record<string, number> = {};
  for (const o of validOrders)
    byChannel[o.channel] = (byChannel[o.channel] ?? 0) + 1;

  console.log('===== RESUMO DA IMPORTAÇÃO =====');
  console.log('Pedidos a importar:', validOrders.length);
  console.log('  por canal:', byChannel);
  console.log('  faturamento total: R$', (totalRevenue / 100).toFixed(2));
  console.log(
    'Itens válidos:',
    totalItems,
    '(excluídos ignorados:',
    excluded,
    '| taxas ignoradas:',
    fees,
    ')',
  );
  console.log('Pedidos pulados por status (não finalizado):', skippedStatus);
  console.log('Pedidos pulados por canal desconhecido:', skippedNoChannel);
  console.log('Itens sem pedido correspondente:', itemsNoOrder);

  if (DRY) {
    console.log('\n[--dry] Nada foi gravado.');
    return;
  }

  // ---- Gravação ----
  if (RESET) {
    const del = await prisma.order.deleteMany({
      where: { externalId: { startsWith: LEG_PREFIX } },
    });
    console.log(`\n[--reset] ${del.count} pedido(s) LEG- apagado(s).`);
  }

  // Fase 1: pedidos (sem itens), em lote, idempotente por (channel, externalId).
  const orderData = validOrders.map((o) => ({
    channel: o.channel,
    status: OrderStatus.DELIVERED,
    externalId: `${LEG_PREFIX}${o.code}`,
    customerName: o.customerName,
    addressStreet: '-',
    paymentMethod:
      o.channel === OrderChannel.OWN
        ? PaymentMethod.CASH
        : PaymentMethod.ONLINE,
    paymentStatus: PaymentStatus.PAID,
    paidAt: o.paidAt,
    createdAt: o.createdAt,
    totalCents: o.totalCents,
    notes: 'Histórico (Consumer)',
  }));

  const BATCH = 1000;
  let insertedOrders = 0;
  for (let i = 0; i < orderData.length; i += BATCH) {
    const res = await prisma.order.createMany({
      data: orderData.slice(i, i + BATCH),
      skipDuplicates: true,
    });
    insertedOrders += res.count;
    process.stdout.write(`\r  pedidos inseridos: ${insertedOrders}/${orderData.length}`);
  }
  console.log('');

  // Fase 2: mapeia externalId → id e insere os itens em lote.
  const created = await prisma.order.findMany({
    where: { externalId: { startsWith: LEG_PREFIX } },
    select: { id: true, externalId: true },
  });
  const idByCode = new Map(
    created.map((o) => [o.externalId!.slice(LEG_PREFIX.length), o.id]),
  );

  const itemData: {
    orderId: string;
    nameSnapshot: string;
    priceCents: number;
    quantity: number;
    menuItemId: null;
  }[] = [];
  for (const [code, list] of itemsByOrder) {
    const orderId = idByCode.get(code);
    if (!orderId) continue;
    for (const it of list) {
      itemData.push({
        orderId,
        nameSnapshot: it.nameSnapshot,
        priceCents: it.priceCents,
        quantity: it.quantity,
        menuItemId: null,
      });
    }
  }

  let insertedItems = 0;
  for (let i = 0; i < itemData.length; i += BATCH) {
    const res = await prisma.orderItem.createMany({
      data: itemData.slice(i, i + BATCH),
    });
    insertedItems += res.count;
    process.stdout.write(`\r  itens inseridos: ${insertedItems}/${itemData.length}`);
  }
  console.log('');
  console.log('Concluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
