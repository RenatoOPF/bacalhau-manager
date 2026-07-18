/**
 * Cria os insumos de estoque e vincula os pratos do cardápio por categoria.
 * Idempotente: upsert dos insumos por nome; só vincula prato/opção que ainda
 * não tem insumo (não sobrescreve ajuste manual feito no painel).
 *
 * Regras de vínculo (cardápio atual — ver docs/cardapio.md):
 * - Categorias com proteína única: Bacalhau Desfiado / em Lascas / em Posta,
 *   Camarão, Polvo, Filé de Frango → Frango, Filé Mignon, Cordeiro.
 * - Peixes: o insumo fica na OPÇÃO (Tilápia/Sirigado/Salmão no nome da opção).
 * - Entradas de camarão (Camarão Crocante/Favorito) → Camarão.
 * - Executivos (sem opções) consomem meia porção (stockHalfUnits = 1).
 * - Ambíguos (Moqueca de Peixe/Bacalhau, iscas, casquinhas...) ficam SEM
 *   vínculo — o gerente decide no painel (Cardápio → seletor de insumo).
 *
 * Uso: npm run stock:seed --workspace backend
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Categoria do cardápio → nome do insumo.
const CATEGORY_TO_STOCK: Record<string, string> = {
  'Bacalhau Desfiado': 'Bacalhau Desfiado',
  'Bacalhau em Lascas': 'Bacalhau em Lascas',
  'Bacalhau em Posta': 'Bacalhau em Posta',
  Camarão: 'Camarão',
  Polvo: 'Polvo',
  'Filé de Frango': 'Frango',
  'Filé Mignon': 'Filé Mignon',
  Cordeiro: 'Cordeiro',
};

// Palavra no nome da opção → insumo (categoria Peixes).
const OPTION_PROTEIN_TO_STOCK: Record<string, string> = {
  tilápia: 'Tilápia',
  tilapia: 'Tilápia',
  sirigado: 'Sirigado',
  salmão: 'Salmão',
  salmao: 'Salmão',
};

// Itens fora das categorias acima que têm insumo claro.
const ITEM_NAME_TO_STOCK: Record<string, string> = {
  'Camarão Crocante': 'Camarão',
  'Camarão Favorito': 'Camarão',
  'Moqueca de Camarão': 'Camarão',
  'Moqueca de Polvo': 'Polvo',
  'Moqueca de Polvo com Camarão': 'Polvo',
  'Arroz de Polvo': 'Polvo',
};

const STOCK_NAMES = [
  'Bacalhau Desfiado',
  'Bacalhau em Lascas',
  'Bacalhau em Posta',
  'Camarão',
  'Tilápia',
  'Sirigado',
  'Salmão',
  'Polvo',
  'Frango',
  'Filé Mignon',
  'Cordeiro',
];

async function main() {
  // 1. Insumos (saldo inicial 0 — o gerente define a contagem no painel).
  const stockByName = new Map<string, string>();
  for (const [i, name] of STOCK_NAMES.entries()) {
    const s = await prisma.stockItem.upsert({
      where: { name },
      update: { sortOrder: i },
      create: { name, sortOrder: i },
    });
    stockByName.set(name, s.id);
  }
  console.log(`Insumos garantidos: ${STOCK_NAMES.length}`);

  // 2. Vínculos por categoria/nome (só onde ainda não há vínculo).
  const categories = await prisma.menuCategory.findMany({
    include: { items: { include: { options: true } } },
  });

  let itemLinks = 0;
  let optionLinks = 0;
  let executivos = 0;

  for (const cat of categories) {
    for (const item of cat.items) {
      const target =
        ITEM_NAME_TO_STOCK[item.name] ?? CATEGORY_TO_STOCK[cat.name];

      // Peixes: proteína no nome da opção → vínculo na opção.
      for (const opt of item.options) {
        if (opt.stockItemId) continue;
        const optNorm = opt.name.toLowerCase();
        const protein = Object.keys(OPTION_PROTEIN_TO_STOCK).find((p) =>
          optNorm.includes(p),
        );
        if (protein) {
          await prisma.menuItemOption.update({
            where: { id: opt.id },
            data: { stockItemId: stockByName.get(OPTION_PROTEIN_TO_STOCK[protein])! },
          });
          optionLinks++;
        }
      }

      if (target && !item.stockItemId) {
        await prisma.menuItem.update({
          where: { id: item.id },
          data: { stockItemId: stockByName.get(target)! },
        });
        itemLinks++;
      }

      // Executivos (prato individual, sem opções) consomem meia porção.
      if (
        item.options.length === 0 &&
        /^executivo/i.test(item.name) &&
        item.stockHalfUnits !== 1
      ) {
        await prisma.menuItem.update({
          where: { id: item.id },
          data: { stockHalfUnits: 1 },
        });
        executivos++;
      }
    }
  }

  console.log(
    `Vínculos: ${itemLinks} pratos, ${optionLinks} opções · ${executivos} executivo(s) → meia porção`,
  );
  console.log(
    'Sem vínculo (decidir no painel): Moqueca de Peixe/Bacalhau, iscas, casquinhas, saladas...',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
