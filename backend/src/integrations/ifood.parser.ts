import { OrderChannel } from '@prisma/client';
import {
  ParsedExternalOrder,
  ParsedExternalItem,
  brlToCents,
} from './parsed-order';

/** Reconhece uma comanda do iFood pelo cabeçalho. */
export function isIfood(lines: string[]): boolean {
  return lines
    .slice(0, 6)
    .some((l) => /\biFood\b/i.test(l) || /Gestor Web/i.test(l));
}

/**
 * Parser da comanda de "Expedição" do iFood (Gestor de Pedidos). Baseado em
 * amostras reais capturadas via impressora fake. Retorna null se não achar o
 * mínimo (id externo + itens) — nesse caso a captura é só arquivada.
 */
export function parseIfood(lines: string[]): ParsedExternalOrder | null {
  const firstMatch = (re: RegExp): string | undefined => {
    for (const l of lines) {
      const m = l.match(re);
      if (m) return m[1].trim();
    }
    return undefined;
  };

  const localizador = firstMatch(/Localizador:\s*(.+)/);
  const externalId = localizador
    ? localizador.replace(/\s+/g, '')
    : firstMatch(/ID:\s*(\d+)/);

  // Número curto exibido pelo iFood: "PEDIDO: #8156" (layout real). Fallback:
  // dígitos logo após "EXPEDICAO" (layout do pedido de teste).
  let shortNumber = firstMatch(/PEDIDO:?\s*#\s*(\d+)/);
  if (!shortNumber) {
    const expIdx = lines.findIndex((l) => /EXPEDICAO/i.test(l));
    if (expIdx >= 0) {
      for (const l of lines.slice(expIdx + 1, expIdx + 6)) {
        const m = l.match(/^\s*(\d+)\b/);
        if (m) {
          shortNumber = m[1];
          break;
        }
      }
    }
  }

  // Telefone + cliente: a linha do telefone contém "ID:" e dígitos de telefone.
  let customerPhone: string | undefined;
  let customerName: string | undefined;
  const phoneIdx = lines.findIndex(
    (l) => /ID:\s*\d+/.test(l) && /\d{3}/.test(l.split('ID:')[0]),
  );
  if (phoneIdx >= 0) {
    customerPhone = lines[phoneIdx].split('ID:')[0].trim() || undefined;
    for (let i = phoneIdx - 1; i >= 0; i--) {
      if (lines[i].trim()) {
        customerName = lines[i].trim();
        break;
      }
    }
  }

  // Itens: "Nx  NOME   R$ x,xx"; sub-linhas (Obs / complementos) vão nas notes.
  const items: ParsedExternalItem[] = [];
  let cur: (ParsedExternalItem & { _notes: string[] }) | null = null;
  const push = () => {
    if (cur) {
      const { _notes, ...rest } = cur;
      items.push({ ...rest, notes: _notes.join(' | ') || null });
      cur = null;
    }
  };
  for (const l of lines) {
    const m = l.match(/^(\d+)x\s+(.+?)\s+R\$\s*([\d.,]+)\s*$/);
    if (m) {
      push();
      cur = {
        quantity: Number(m[1]),
        name: m[2].trim(),
        priceCents: brlToCents(m[3]),
        _notes: [],
      };
      continue;
    }
    if (cur) {
      const s = l.trim();
      if (!s) continue;
      if (s.startsWith('Obs:')) cur._notes.push(s);
      else if (/^\d+\s+.+R\$/.test(s))
        cur._notes.push(s.replace(/\s+R\$.*/, '').trim());
      else if (s.startsWith('---') || /Pagamento/i.test(s)) {
        push();
        break;
      }
    }
  }
  push();

  const totalStr = firstMatch(/Valor total do pedido:\s*R\$\s*([\d.,]+)/);
  const deliveryStr = firstMatch(/Taxa de entrega:\s*R\$\s*([\d.,]+)/);
  const itemsCents = totalStr ? brlToCents(totalStr) : 0;
  const deliveryFeeCents = deliveryStr ? brlToCents(deliveryStr) : 0;

  if (!externalId || items.length === 0) return null;

  return {
    channel: OrderChannel.IFOOD,
    externalId,
    shortNumber,
    customerName,
    customerPhone,
    addressStreet: firstMatch(/Endereco:\s*(.+)/),
    addressComplement: firstMatch(/Comp:\s*(.+)/),
    addressNeighborhood: firstMatch(/Bairro:\s*(.+)/),
    // Só a referência de entrega; cidade/UF/CEP não vão para a comanda.
    addressReference: firstMatch(/Ref:\s*(.+)/),
    items,
    deliveryFeeCents,
    // Total = itens + taxa de entrega (a taxa de serviço é do iFood, fica fora).
    totalCents: itemsCents + deliveryFeeCents,
    paidOnline: lines.some((l) => /Pagamento realizado/i.test(l)),
  };
}
