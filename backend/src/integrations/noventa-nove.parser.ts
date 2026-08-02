import { OrderChannel } from '@prisma/client';
import { ParsedExternalOrder, ParsedExternalItem, brlToCents } from './parsed-order';

/** Reconhece uma comanda do 99Food pelo cabeçalho. */
export function isNoventa_Nove(lines: string[]): boolean {
  return lines.slice(0, 8).some((l) => /99Food/i.test(l));
}

/**
 * Parser da comanda do 99Food. Baseado em amostra real capturada via impressora
 * fake. Retorna null se não achar o mínimo (localizador + itens).
 *
 * Peculiaridades do formato 99:
 * - O "Localizador" pode ser quebrado em duas linhas pela impressora
 *   ("Localiza" / "dor:09238629") — buscamos no texto compactado (sem espaços).
 * - O nome do item também pode ser quebrado: linhas indentadas logo após um item
 *   completam o nome. Se a linha original tinha 2+ espaços antes de "R$", o
 *   corte foi em fronteira de palavra → inserimos um espaço ao recompor.
 */
export function parseNoventa_Nove(lines: string[]): ParsedExternalOrder | null {
  // Texto compactado (sem espaços) para encontrar campos que quebram entre linhas
  const compact = lines.join('').replace(/\s+/g, '');

  // externalId: Localizador (número do pedido na plataforma, usado para dedup)
  const locM = compact.match(/Localizador:?(\d+)/i);
  const externalId = locM?.[1];

  // Número curto exibido na comanda: linha contendo apenas "#NNNNN"
  let shortNumber: string | undefined;
  let customerName: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*#(\d+)\s*$/);
    if (m) {
      shortNumber = m[1];
      for (let j = i + 1; j < lines.length; j++) {
        const name = lines[j].trim();
        if (name) {
          customerName = name;
          break;
        }
      }
      break;
    }
  }

  // Telefone: "(DDD)XXXXXXXX" na linha que contém "Telefone"
  let customerPhone: string | undefined;
  const telLine = lines.find((l) => /Telefone/i.test(l));
  if (telLine) {
    const m = telLine.match(/(\(\d{2,3}\)\d+)/);
    if (m) customerPhone = m[1];
  }

  // Endereço: linhas após "Endereço:" até o próximo separador
  let addressStreet: string | undefined;
  let addressNeighborhood: string | undefined;
  const endIdx = lines.findIndex((l) => /Endere.o:/i.test(l));
  if (endIdx >= 0) {
    const firstPart = lines[endIdx].replace(/Endere.o:\s*/i, '').trim();
    const addrParts = firstPart ? [firstPart] : [];
    for (let i = endIdx + 1; i < lines.length; i++) {
      if (lines[i].startsWith('---')) break;
      const s = lines[i].trim();
      if (s) addrParts.push(s);
    }
    const fullAddr = addrParts
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/\s*,/g, ',')
      .trim();
    addressStreet = fullAddr;
    // Bairro: primeiro "- BAIRRO," no endereço completo
    const neighM = fullAddr.match(/-\s*([^-,]+),/);
    if (neighM) addressNeighborhood = neighM[1].trim();
  }

  // Itens: "Nx NOME R$XX,XX" — o nome pode ser quebrado pela impressora
  const items: ParsedExternalItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    // Captura os espaços antes de "R$" para detectar quebra em fronteira de palavra
    const m = lines[i].match(/^(\d+)x\s+(.+?)(\s+)R\$\s*([\d.,]+)\s*$/);
    if (!m) continue;

    let name = m[2].trim();
    const qty = Number(m[1]);
    const priceCents = brlToCents(m[4]);

    // 2+ espaços antes de R$ = corte em fronteira de palavra → recompor com espaço
    const wordBoundary = m[3].length > 1;

    // Linhas seguintes indentadas sem preço completam o nome
    while (i + 1 < lines.length) {
      const next = lines[i + 1];
      if (/^\s{2,}/.test(next) && !/R\$/.test(next)) {
        const cont = next.trim();
        name += wordBoundary ? ' ' + cont : cont;
        i++;
      } else {
        break;
      }
    }

    items.push({ quantity: qty, name, priceCents });
  }

  // Total: "Total do pedido ... R$XX,XX" (geralmente numa única linha)
  const totalLine = lines.find((l) => /Total do pedido/i.test(l));
  const totalM = totalLine?.match(/R\$\s*([\d.,]+)/);
  const totalCents = totalM ? brlToCents(totalM[1]) : 0;

  // paidOnline: se há "Cobrar do cliente", o cliente paga na entrega
  const paidOnline = !lines.some((l) => /Cobrar do cliente/i.test(l));

  if (!externalId || items.length === 0) return null;

  return {
    channel: OrderChannel.NOVENTA_NOVE,
    externalId,
    shortNumber,
    customerName,
    customerPhone,
    addressStreet,
    addressNeighborhood,
    items,
    deliveryFeeCents: 0,
    totalCents,
    paidOnline,
  };
}
