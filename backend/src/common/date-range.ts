import { BadRequestException } from '@nestjs/common';

/** Intervalo [start, end) de um dia local a partir de "YYYY-MM-DD". */
export function dayRange(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00`);
  if (Number.isNaN(start.getTime())) {
    throw new BadRequestException('Data inválida (use YYYY-MM-DD)');
  }
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/**
 * Filtro de período para `paidAt`/`createdAt` a partir de datas "YYYY-MM-DD"
 * (inclusivo nas duas pontas). Retorna undefined se nenhuma data for passada.
 */
export function periodFilter(
  from?: string,
  to?: string,
): { gte?: Date; lt?: Date } | undefined {
  if (!from && !to) return undefined;
  const filter: { gte?: Date; lt?: Date } = {};
  if (from) filter.gte = dayRange(from).start;
  if (to) filter.lt = dayRange(to).end;
  return filter;
}

/** Formata uma data como "YYYY-MM-DD" no fuso local. */
export function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
