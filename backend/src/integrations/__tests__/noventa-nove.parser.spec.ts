import * as fs from 'fs';
import * as path from 'path';
import { isNoventa_Nove, parseNoventa_Nove } from '../noventa-nove.parser';
import { decodeEscPosBase64, toLines } from '../escpos';

jest.mock('@prisma/client', () => ({
  OrderChannel: { IFOOD: 'IFOOD', NOVENTA_NOVE: 'NOVENTA_NOVE', OWN: 'OWN' },
}));

const SAMPLE_PATH = path.resolve(__dirname, '../../../..', 'amostra-99-captura-real.b64.txt');

function loadSampleLines(): string[] {
  const b64 = fs.readFileSync(SAMPLE_PATH, { encoding: 'utf-8' }).replace(/^﻿/, '').trim();
  return toLines(decodeEscPosBase64(b64));
}

describe('isNoventa_Nove', () => {
  it('reconhece o cabeçalho da comanda real', () => {
    expect(isNoventa_Nove(loadSampleLines())).toBe(true);
  });

  it('retorna false para linhas vazias', () => {
    expect(isNoventa_Nove([])).toBe(false);
  });

  it('retorna false para comanda iFood', () => {
    expect(isNoventa_Nove(['iFood', 'Bacalhau & Cia'])).toBe(false);
  });
});

describe('parseNoventa_Nove', () => {
  let result: ReturnType<typeof parseNoventa_Nove>;

  beforeAll(() => {
    result = parseNoventa_Nove(loadSampleLines());
  });

  it('retorna um pedido não-nulo', () => {
    expect(result).not.toBeNull();
  });

  it('canal correto', () => {
    expect(result!.channel).toBe('NOVENTA_NOVE');
  });

  it('externalId do localizador (quebrado entre linhas)', () => {
    expect(result!.externalId).toBe('00000000');
  });

  it('número curto do pedido', () => {
    expect(result!.shortNumber).toBe('467002');
  });

  it('nome do cliente', () => {
    expect(result!.customerName).toBe('Cliente Teste');
  });

  it('telefone do cliente', () => {
    expect(result!.customerPhone).toBe('(082)00000000');
  });

  it('bairro extraído do endereço', () => {
    expect(result!.addressNeighborhood).toBe('Bairro Teste');
  });

  it('pelo menos um item parseado', () => {
    expect(result!.items.length).toBeGreaterThan(0);
  });

  it('preço do item vem da opção quando base é R$0', () => {
    const item = result!.items[0];
    expect(item.priceCents).toBe(12500);
  });

  it('taxa de entrega zero (99 não imprime na comanda)', () => {
    expect(result!.deliveryFeeCents).toBe(0);
  });

  it('total do pedido', () => {
    expect(result!.totalCents).toBe(13199);
  });

  it('pago online (cobrar do cliente R$0,00)', () => {
    expect(result!.paidOnline).toBe(true);
  });

  it('retorna null para linhas sem localizador', () => {
    expect(parseNoventa_Nove(['99Food', '1x Prato R$10,00'])).toBeNull();
  });

  it('retorna null para linhas sem itens', () => {
    expect(parseNoventa_Nove(['99Food', 'Localizador:123456'])).toBeNull();
  });
});
