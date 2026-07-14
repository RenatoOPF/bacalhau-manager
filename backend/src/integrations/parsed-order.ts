import { OrderChannel } from '@prisma/client';

export interface ParsedExternalItem {
  quantity: number;
  name: string;
  priceCents: number;
  notes?: string | null;
}

/** Pedido extraído de uma comanda capturada (iFood/99). */
export interface ParsedExternalOrder {
  channel: OrderChannel;
  externalId: string; // Localizador (iFood) / código (99) — usado para dedup
  shortNumber?: string; // número curto exibido na comanda
  customerName?: string;
  customerPhone?: string;
  addressStreet?: string;
  addressComplement?: string;
  addressNeighborhood?: string;
  addressReference?: string;
  items: ParsedExternalItem[];
  totalCents: number;
  paidOnline: boolean;
}

/** Converte "1.234,56" ou "6,99" (reais) em centavos. */
export function brlToCents(value: string): number {
  const n = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
