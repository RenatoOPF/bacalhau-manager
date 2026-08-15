/**
 * Importa clientes do sistema antigo (Consumer) para a tabela Customer /
 * CustomerAddress.
 *
 * Fonte: CSV gerado do Lista-Clientes.xlsx via LibreOffice.
 * Colunas: Nome, Telefone Principal, Endereço, Num., Bairro, E-mail,
 *          Qtd. Pedidos, Últ. Pedido
 *
 * Estratégia:
 *  - Clientes com telefone → upsert por phone (preserva dados existentes
 *    cadastrados manualmente; só preenche nome/endereço se estiver vazio).
 *  - Clientes sem telefone → create simples (skipDuplicates por nome+bairro
 *    não é suportado nativamente; são criados como novos).
 *  - Endereço → CustomerAddress (isDefault: true), só se rua informada.
 *  - Todos marcados com notes = "Importado do Consumer" para identificação.
 *
 * Idempotente: --reset apaga todos os clientes com essa nota antes de reimportar.
 * --dry só analisa sem gravar.
 *
 * Uso:
 *   npx ts-node prisma/import-legacy-customers.ts <clientes.csv> [--dry] [--reset]
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry');
const RESET = process.argv.includes('--reset');
const NOTES_MARKER = 'Importado do Consumer';

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let f: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { f.push(cur); cur = ''; }
      else if (c === '\n') { f.push(cur); rows.push(f); f = []; cur = ''; }
      else if (c === '\r') { /* ignora */ }
      else cur += c;
    }
  }
  if (cur.length || f.length) { f.push(cur); rows.push(f); }
  return rows;
}

/** Normaliza telefone: mantém só dígitos, remove país (55) se presente. */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  // Remove DDI 55 se o número tiver 12-13 dígitos
  const clean = digits.length >= 12 && digits.startsWith('55')
    ? digits.slice(2)
    : digits;
  // Mínimo: DDD (2) + 8 dígitos
  return clean.length >= 10 ? clean : null;
}

async function main() {
  const [csvPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!csvPath) throw new Error('Uso: import-legacy-customers.ts <clientes.csv> [--dry] [--reset]');

  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));
  const header = rows[0];

  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`Coluna não encontrada: "${name}"`);
    return i;
  };

  const iNome   = col('Nome');
  const iTel    = col('Telefone Principal');
  const iEnd    = col('Endereço');
  const iNum    = col('Num.');
  const iBairro = col('Bairro');

  interface ClienteRec {
    name: string;
    phone: string | null;
    street: string | null;
    number: string | null;
    neighborhood: string | null;
  }

  const clientes: ClienteRec[] = [];
  let skippedEmpty = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[iNome]?.trim()) { skippedEmpty++; continue; }
    const name = r[iNome].trim().replace(/\s+/g, ' ');
    const phone = normalizePhone(r[iTel] ?? '');
    const street = r[iEnd]?.trim() || null;
    const number = r[iNum]?.trim() || null;
    const neighborhood = r[iBairro]?.trim() || null;
    clientes.push({ name, phone, street, number, neighborhood });
  }

  const comTel   = clientes.filter((c) => c.phone);
  const semTel   = clientes.filter((c) => !c.phone);
  const comEnder = clientes.filter((c) => c.street);

  console.log('===== RESUMO DA IMPORTAÇÃO =====');
  console.log('Clientes a importar:', clientes.length);
  console.log('  com telefone:', comTel.length);
  console.log('  sem telefone:', semTel.length);
  console.log('  com endereço:', comEnder.length);
  console.log('Linhas ignoradas (nome vazio):', skippedEmpty);

  if (DRY) { console.log('\n[--dry] Nada foi gravado.'); return; }

  if (RESET) {
    const del = await prisma.customer.deleteMany({
      where: { notes: NOTES_MARKER },
    });
    console.log(`\n[--reset] ${del.count} cliente(s) removido(s).`);
  }

  let upserted = 0;
  let created = 0;
  let addresses = 0;

  for (const c of clientes) {
    let customerId: string;

    if (c.phone) {
      // Upsert por telefone — não sobrescreve dados editados manualmente
      const existing = await prisma.customer.findUnique({ where: { phone: c.phone } });
      if (existing) {
        customerId = existing.id;
        upserted++;
      } else {
        const novo = await prisma.customer.create({
          data: { name: c.name, phone: c.phone, notes: NOTES_MARKER },
        });
        customerId = novo.id;
        created++;
      }
    } else {
      const novo = await prisma.customer.create({
        data: { name: c.name, phone: null, notes: NOTES_MARKER },
      });
      customerId = novo.id;
      created++;
    }

    // Endereço: cria só se tem rua e o cliente ainda não tem nenhum endereço
    if (c.street) {
      const existingAddr = await prisma.customerAddress.count({ where: { customerId } });
      if (existingAddr === 0) {
        await prisma.customerAddress.create({
          data: {
            customerId,
            street: c.street,
            number: c.number,
            neighborhood: c.neighborhood,
            isDefault: true,
          },
        });
        addresses++;
      }
    }
  }

  console.log(`\nClientes atualizados (já existiam): ${upserted}`);
  console.log(`Clientes criados: ${created}`);
  console.log(`Endereços criados: ${addresses}`);
  console.log('Concluído.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
