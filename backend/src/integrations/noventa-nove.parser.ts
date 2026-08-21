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
    // Recompõe palavras partidas pela impressora: se o trecho anterior termina
    // em letra e o próximo começa em minúscula, são a mesma palavra (ex.: "M" + "angabeiras").
    let fullAddr = '';
    for (const part of addrParts) {
      if (fullAddr.match(/[a-zA-Z]$/) && part.match(/^[a-z]/)) {
        fullAddr += part;
      } else {
        fullAddr += (fullAddr ? ' ' : '') + part;
      }
    }
    fullAddr = fullAddr.replace(/\s+/g, ' ').replace(/\s*,/g, ',').trim();
    addressStreet = fullAddr;
    // Bairro: tenta "- BAIRRO," primeiro; fallback para "bairro NOME" explícito.
    const neighDash = fullAddr.match(/-\s*([^-,]+),/);
    const neighWord = fullAddr.match(/\bbairro\s+([^,]+?)(?:\s*[,-]|$)/i);
    const rawNeighborhood = (neighDash?.[1] ?? neighWord?.[1])?.trim();
    if (rawNeighborhood) addressNeighborhood = rawNeighborhood;
  }

  // Itens: "Nx NOME R$XX,XX" — o nome pode ser quebrado pela impressora.
  // O 99Food usa sub-itens indentados para opções (ex.: tamanho):
  //   1x Nome do Prato   R$0,00      ← base (preço zero quando há opção)
  //      continuação...              ← quebra de palavra
  //     [Tamanho]                    ← cabeçalho de categoria (ignorado)
  //     1x Porção Inteira R$125,00   ← opção selecionada com o preço real
  const items: ParsedExternalItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\d+)x\s+(.+?)(\s+)R\$\s*([\d.,]+)\s*$/);
    if (!m) continue;

    let name = m[2].trim();
    const qty = Number(m[1]);
    let priceCents = brlToCents(m[4]);
    const notes: string[] = [];

    // 2+ espaços antes de R$ = corte em fronteira de palavra → recompor com espaço
    const wordBoundary = m[3].length > 1;

    while (i + 1 < lines.length) {
      const next = lines[i + 1];
      if (!/^\s{2,}/.test(next)) break;

      const cont = next.trim();
      if (!cont) { i++; continue; }

      // [Categoria] → cabeçalho visual, ignorar
      if (/^\[.+\]$/.test(cont)) { i++; continue; }

      // Sub-item indentado: "Nx Opção R$XX,XX" → opção selecionada
      const subM = cont.match(/^(\d+)x\s+(.+?)(\s+)R\$\s*([\d.,]+)\s*$/);
      if (subM) {
        let subName = subM[2].trim();
        const subWordBoundary = subM[3].length > 1;
        const subPrice = brlToCents(subM[4]);
        i++;

        // O texto da opção também pode ser quebrado pela impressora
        // (ex.: "Porção In" / "teira") — recompõe antes do próximo sub-item.
        while (i + 1 < lines.length) {
          const n2 = lines[i + 1];
          if (!/^\s{2,}/.test(n2)) break;
          const c2 = n2.trim();
          if (!c2) { i++; continue; }
          if (/^\[.+\]$/.test(c2)) break;
          if (/^\d+x\s+.+R\$/.test(c2)) break; // próximo sub-item
          if (/R\$/.test(n2)) break;
          subName += subWordBoundary ? ' ' + c2 : c2;
          i++;
        }

        notes.push(`${subM[1]} ${subName}`);
        // Preço real vem da opção quando o item base tinha R$0
        if (priceCents === 0 && subPrice > 0) priceCents = subPrice;
        continue;
      }

      // Linha com R$ mas não reconhecida → fim do item
      if (/R\$/.test(next)) break;

      // Continuação do nome (quebra de linha pela impressora).
      // Sempre insere espaço: o corte pode cair no fim de uma palavra mesmo
      // quando só havia 1 espaço antes de R$ (sem padding). O pior caso —
      // corte mid-word como "Bacal" + "hau" → "Bacal hau" — ainda é
      // reconhecível pelo normalize() do estimador de CMV.
      name += ' ' + cont;
      i++;
    }

    items.push({ quantity: qty, name, priceCents, notes: notes.join(' | ') || null });
  }

  // Total: "Total do pedido ... R$XX,XX" (geralmente numa única linha)
  const totalLine = lines.find((l) => /Total do pedido/i.test(l));
  const totalM = totalLine?.match(/R\$\s*([\d.,]+)/);
  const totalCents = totalM ? brlToCents(totalM[1]) : 0;

  // paidOnline: "Cobrar do cliente R$0,00" → pago via app; valor > 0 → cobrar na entrega
  const cobrarIdx = lines.findIndex((l) => /Cobrar do cliente/i.test(l));
  let paidOnline = true;
  if (cobrarIdx >= 0) {
    const cobrarText = lines[cobrarIdx] + ' ' + (lines[cobrarIdx + 1] ?? '');
    const cobrarM = cobrarText.match(/R\$\s*([\d.,]+)/);
    paidOnline = cobrarM ? brlToCents(cobrarM[1]) === 0 : false;
  }

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
