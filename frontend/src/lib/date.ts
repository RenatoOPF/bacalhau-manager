/** Formata um Date como "YYYY-MM-DD" no fuso horário local (vira à 00h00 local). */
export function localIsoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isoToday(): string {
  return localIsoDate(new Date());
}

export function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localIsoDate(d);
}

export function weekRange(offset: number): { from: string; to: string } {
  const d = new Date();
  const day = d.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMon + offset * 7);
  const mon = new Date(d);
  const sun = new Date(d);
  sun.setDate(sun.getDate() + 6);
  return {
    from: localIsoDate(mon),
    to: localIsoDate(sun),
  };
}

export function monthRange(offset: number): { from: string; to: string } {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + offset;
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  return {
    from: localIsoDate(first),
    to: localIsoDate(last),
  };
}
