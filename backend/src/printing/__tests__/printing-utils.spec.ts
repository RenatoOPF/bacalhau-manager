import { toPrintOption, formatItemNote } from '../printing-utils';

describe('toPrintOption', () => {
  it('converte "Meia Porção" para "Individual"', () => {
    expect(toPrintOption('Meia Porção')).toBe('Individual');
  });

  it('converte "Porção Inteira" para "Inteira"', () => {
    expect(toPrintOption('Porção Inteira')).toBe('Inteira');
  });

  it('preserva proteína antes do tamanho (peixe)', () => {
    expect(toPrintOption('Tilápia Meia Porção')).toBe('Tilápia Individual');
  });

  it('aplica alias da cozinha (Dezena Lusitana)', () => {
    expect(toPrintOption('Dezena Lusitana')).toBe('10 bolinhos');
  });

  it('não altera nomes sem correspondência', () => {
    expect(toPrintOption('Bacalhau Rosa com Nata')).toBe('Bacalhau Rosa com Nata');
  });

  it('é case-insensitive para Meia Porcao (sem cedilha)', () => {
    expect(toPrintOption('meia porcao')).toBe('Individual');
  });
});

describe('formatItemNote', () => {
  it('converte tamanho "1 Inteira" em etiqueta (INTEIRA)', () => {
    expect(formatItemNote('1 Inteira')).toEqual(['(INTEIRA)']);
  });

  it('converte tamanho "1 Individual" em etiqueta (INDIVIDUAL)', () => {
    expect(formatItemNote('1 Individual')).toEqual(['(INDIVIDUAL)']);
  });

  it('inclui proteína na etiqueta quando presente (ex.: "Tilapia - Inteira")', () => {
    expect(formatItemNote('Tilapia - Inteira')).toEqual(['(TILAPIA - INTEIRA)']);
  });

  it('formata observação com prefixo "obs:"', () => {
    expect(formatItemNote('Obs: sem cebola')).toEqual(['obs: sem cebola']);
  });

  it('formata complemento livre com prefixo asterisco', () => {
    expect(formatItemNote('1 Chilli')).toEqual(['* 1 Chilli']);
  });

  it('processa múltiplos segmentos separados por " | "', () => {
    const result = formatItemNote('1 Inteira | 1 Chilli | Obs: sem sal');
    expect(result).toEqual(['(INTEIRA)', '* 1 Chilli', 'obs: sem sal']);
  });

  it('somente o índice 0 pode virar etiqueta de tamanho', () => {
    const result = formatItemNote('1 Chilli | 1 Inteira');
    expect(result[0]).toBe('* 1 Chilli');
    expect(result[1]).toBe('* 1 Inteira');
  });
});
