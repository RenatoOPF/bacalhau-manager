/** Applies progressive phone masking for 10–11 digit Brazilian numbers. */
export function maskPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length > 6)
    return `(${d.slice(0, 2)}) ${d.slice(2, d.length > 10 ? 7 : 6)}-${d.slice(d.length > 10 ? 7 : 6)}`;
  if (d.length > 2) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length > 0) return `(${d}`;
  return '';
}

/** Formats a stored digits-only phone for display (e.g. "82999999999" → "(82) 99999-9999"). */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  return maskPhone(phone);
}
