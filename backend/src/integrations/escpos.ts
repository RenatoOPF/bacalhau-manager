/**
 * Decodificação best-effort de um stream de impressão ESC/POS para texto.
 *
 * Remove os comandos de controle mais comuns (ESC/GS + argumento) e decodifica
 * o restante usando o codepage CP860 (português) — o mesmo usado pelas térmicas
 * no Brasil. Suficiente para extrair o texto das comandas do iFood/99.
 */

// CP860, bytes 0x80..0xFF → Unicode (gerado do codepage).
const CP860_HIGH =
  'ÇüéâãàÁçêÊèÍÔìÃÂÉÀÈôõòÚùÌÕÜ¢£Ù₧ÓáíóúñÑªº¿Ò¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';

/** Decodifica um byte único usando CP860. */
function cp860(byte: number): string {
  if (byte < 0x80) return String.fromCharCode(byte);
  return CP860_HIGH[byte - 0x80] ?? '';
}

/** Converte o stream ESC/POS em texto (mantém quebras de linha). */
export function decodeEscPos(buf: Buffer): string {
  const out: string[] = [];
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 0x1b || b === 0x1d) {
      // ESC/GS: pula o comando e (heurística) um byte de argumento.
      i += 1;
      continue;
    }
    if (b === 0x0a) {
      out.push('\n');
      continue;
    }
    if (b === 0x0d) continue; // CR
    if (b >= 0x20) out.push(cp860(b));
  }
  return out.join('');
}

/** Decodifica ESC/POS a partir de base64. */
export function decodeEscPosBase64(b64: string): string {
  return decodeEscPos(Buffer.from(b64, 'base64'));
}

/** Linhas do texto, sem espaços à direita (o ESC/POS preenche até a largura). */
export function toLines(text: string): string[] {
  return text.split('\n').map((l) => l.replace(/\s+$/, ''));
}
