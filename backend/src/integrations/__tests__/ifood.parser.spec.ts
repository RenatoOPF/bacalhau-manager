import * as fs from 'fs';
import * as path from 'path';
import { isIfood, parseIfood } from '../ifood.parser';
import { decodeEscPosBase64, toLines } from '../escpos';

jest.mock('@prisma/client', () => ({
  OrderChannel: { IFOOD: 'IFOOD', NOVENTA_NOVE: 'NOVENTA_NOVE', OWN: 'OWN' },
}));

const SAMPLE_PATH = path.resolve(__dirname, '../../../..', 'amostra-captura-ifood-real.b64.txt');

function loadSampleLines(): string[] {
  const b64 = fs.readFileSync(SAMPLE_PATH, 'utf-8').trim();
  return toLines(decodeEscPosBase64(b64));
}

describe('isIfood', () => {
  it('reconhece o cabeçalho da comanda real', () => {
    expect(isIfood(loadSampleLines())).toBe(true);
  });

  it('retorna false para linhas vazias', () => {
    expect(isIfood([])).toBe(false);
  });

  it('retorna false para comanda 99Food', () => {
    expect(isIfood(['99Food', 'Bacalhau & Cia'])).toBe(false);
  });
});

describe('parseIfood', () => {
  let result: ReturnType<typeof parseIfood>;

  beforeAll(() => {
    result = parseIfood(loadSampleLines());
  });

  it('retorna um pedido não-nulo', () => {
    expect(result).not.toBeNull();
  });

  it('canal correto', () => {
    expect(result!.channel).toBe('IFOOD');
  });

  it('externalId sem espaços (localizador compactado)', () => {
    expect(result!.externalId).toBe('29507756');
  });

  it('número curto do pedido', () => {
    expect(result!.shortNumber).toBe('8156');
  });

  it('nome do cliente', () => {
    expect(result!.customerName).toBe('Cliente Anonimo');
  });

  it('telefone do cliente', () => {
    expect(result!.customerPhone).toBe('0800 705 3040');
  });

  it('endereço', () => {
    expect(result!.addressStreet).toBe('Rua Anonima, 123');
    expect(result!.addressComplement).toBe('101');
    expect(result!.addressNeighborhood).toBe('Bairro Anonimo');
    expect(result!.addressReference).toBe('Referencia Anonima');
  });

  it('um item parseado', () => {
    expect(result!.items).toHaveLength(1);
    const item = result!.items[0];
    expect(item.name).toBe('Executivo de peixe grelhado - Tilapia');
    expect(item.quantity).toBe(1);
    expect(item.priceCents).toBe(5399);
    expect(item.notes).toBeNull();
  });

  it('taxa de entrega', () => {
    expect(result!.deliveryFeeCents).toBe(499);
  });

  it('total = itens + entrega', () => {
    expect(result!.totalCents).toBe(5399 + 499);
  });

  it('pago online', () => {
    expect(result!.paidOnline).toBe(true);
  });

  it('retorna null para linhas sem localizador', () => {
    expect(parseIfood(['iFood', '1x Prato R$ 10,00'])).toBeNull();
  });

  it('retorna null para linhas sem itens', () => {
    expect(parseIfood(['iFood', 'Localizador: 123456'])).toBeNull();
  });
});
