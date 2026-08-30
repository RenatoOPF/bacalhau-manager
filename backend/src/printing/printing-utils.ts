// Aliases de exibição para a cozinha: nome no cardápio → label impresso.
export const KITCHEN_ALIASES: [RegExp, string][] = [
  [/Dezena Lusitana/gi, '10 bolinhos'],
];

export function toPrintOption(name: string): string {
  let result = name
    .replace(/Meia Por[çc][ãa]o/gi, 'Individual')
    .replace(/Por[çc][ãa]o Inteira/gi, 'Inteira');
  for (const [pattern, alias] of KITCHEN_ALIASES) {
    result = result.replace(pattern, alias);
  }
  return result;
}

/**
 * Formata as notes de um item iFood em segmentos prontos para imprimir.
 * Cada segmento separado por " | " vira "(TAMANHO)", "* complemento" ou "obs: ...".
 */
export function formatItemNote(note: string): string[] {
  return note.split(' | ').map((part, index) => {
    const trimmed = part.trim();
    if (index === 0) {
      const m = toPrintOption(trimmed).match(
        /^(?:\d+\s+)?(?:(.+?)\s*-\s*)?(Individual|Inteira)$/i,
      );
      if (m) {
        const prefix = m[1] ? `${m[1].toUpperCase()} - ` : '';
        return `(${prefix}${m[2].toUpperCase()})`;
      }
    }
    if (/^Obs:/i.test(trimmed)) return `obs: ${trimmed.slice(4).trim()}`;
    return `* ${trimmed}`;
  });
}
