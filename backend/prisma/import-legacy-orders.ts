/**
 * Importa os pedidos históricos do sistema antigo para a tabela de arquivo
 * LegacyOrder. Idempotente: `code` é único e usamos skipDuplicates, então
 * rodar de novo não duplica.
 *
 * O arquivo de dados (prisma/data/legacy-orders.json, ~5 MB) NÃO é versionado
 * — é transferido para a máquina que roda a importação.
 *
 * Uso: npm run legacy:import --workspace backend [-- caminho/para/legacy-orders.json]
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface LegacyRow {
  code: string;
  openedAt: string;
  closedAt: string | null;
  status: string | null;
  createdBy: string | null;
  customerName: string | null;
  type: string | null;
  channel: string | null;
  totalCents: number;
}

async function main() {
  const file =
    process.argv[2] || path.join(__dirname, 'data', 'legacy-orders.json');
  if (!fs.existsSync(file)) {
    throw new Error(`Arquivo não encontrado: ${file}`);
  }
  const rows: LegacyRow[] = JSON.parse(fs.readFileSync(file, 'utf-8'));
  console.log(`Lendo ${rows.length} pedidos de ${file}`);

  const data = rows.map((r) => ({
    code: r.code,
    openedAt: new Date(r.openedAt),
    closedAt: r.closedAt ? new Date(r.closedAt) : null,
    status: r.status,
    createdBy: r.createdBy,
    customerName: r.customerName,
    type: r.type,
    channel: r.channel,
    totalCents: r.totalCents ?? 0,
  }));

  const BATCH = 1000;
  let inserted = 0;
  for (let i = 0; i < data.length; i += BATCH) {
    const res = await prisma.legacyOrder.createMany({
      data: data.slice(i, i + BATCH),
      skipDuplicates: true,
    });
    inserted += res.count;
    process.stdout.write(`\r  inseridos: ${inserted}/${data.length}`);
  }
  console.log(`\nConcluído: ${inserted} novos (duplicados ignorados).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
