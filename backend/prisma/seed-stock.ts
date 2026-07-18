/**
 * Cria os insumos de estoque e vincula os pratos do cardápio.
 * Idempotente: upsert dos insumos por nome; só vincula prato/opção que ainda
 * não tem vínculo (não sobrescreve ajuste manual feito no painel) — exceto os
 * pratos multi-insumo listados em MULTI, que são regravados.
 *
 * Modelo (decidido com o gerente):
 * - Bacalhau tem DOIS níveis: "Bacalhau (kg)" (bruto congelado, em kg) e as
 *   porções preparadas (Desfiado/Lascas/Casquinha), creditadas via produção
 *   manual no painel ("usei 1 kg → 3 porções de desfiado"). Posta é feita à
 *   parte e tem estoque próprio de porções.
 * - Bolinho de Bacalhau é controlado por UNIDADE (porção do cardápio = 6 un).
 * - Pratos podem consumir vários insumos (Moqueca de Polvo com Camarão).
 * - Executivos consomem meia porção (qty 0.5).
 * - Peixes: o vínculo fica na OPÇÃO (proteína + tamanho no nome da opção).
 *
 * Uso: npm run stock:seed --workspace backend
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const toMilli = (qty: number) => Math.round(qty * 1000);

// Insumos: [nome, unidade]
const STOCK_ITEMS: [string, string][] = [
  ['Bacalhau (kg)', 'kg'],
  ['Bacalhau Desfiado', 'porção'],
  ['Bacalhau em Lascas', 'porção'],
  ['Bacalhau em Posta', 'porção'],
  ['Casquinha de Bacalhau', 'porção'],
  ['Bolinho de Bacalhau', 'un'],
  ['Camarão', 'porção'],
  ['Tilápia', 'porção'],
  ['Sirigado', 'porção'],
  ['Salmão', 'porção'],
  ['Polvo', 'porção'],
  ['Frango', 'porção'],
  ['Filé Mignon', 'porção'],
  ['Cordeiro', 'porção'],
];

// Insumo preparado → matéria-prima (habilita a produção manual no painel).
// Posta fica de fora: é feita à parte, sem passar pelo estoque de kg.
const SOURCES: Record<string, string> = {
  'Bacalhau Desfiado': 'Bacalhau (kg)',
  'Bacalhau em Lascas': 'Bacalhau (kg)',
  'Casquinha de Bacalhau': 'Bacalhau (kg)',
};

// Categoria do cardápio → insumo (consumo 1 porção por Inteira; Meia = 0,5).
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

// Itens fora das categorias acima com insumo claro: nome → [insumo, qty].
const ITEM_TO_STOCK: Record<string, [string, number]> = {
  'Camarão Crocante': ['Camarão', 1],
  'Camarão Favorito': ['Camarão', 1],
  'Moqueca de Camarão': ['Camarão', 1],
  'Moqueca de Polvo': ['Polvo', 1],
  'Arroz de Polvo': ['Polvo', 1],
  'Casquinha de Bacalhau': ['Casquinha de Bacalhau', 1],
  'Bolinho de Bacalhau': ['Bolinho de Bacalhau', 1],
  'Porção de Bolinhos': ['Bolinho de Bacalhau', 6],
};

// Pratos que consomem MAIS DE UM insumo — vínculos regravados a cada seed.
const MULTI: Record<string, [string, number][]> = {
  'Moqueca de Polvo com Camarão': [
    ['Polvo', 0.5],
    ['Camarão', 0.5],
  ],
};

async function main() {
  const stockByName = new Map<string, string>();
  for (const [i, [name, unit]] of STOCK_ITEMS.entries()) {
    const s = await prisma.stockItem.upsert({
      where: { name },
      update: { sortOrder: i, unit },
      create: { name, unit, sortOrder: i },
    });
    stockByName.set(name, s.id);
  }
  for (const [derived, source] of Object.entries(SOURCES)) {
    await prisma.stockItem.update({
      where: { name: derived },
      data: { sourceId: stockByName.get(source)! },
    });
  }
  console.log(`Insumos garantidos: ${STOCK_ITEMS.length}`);

  const categories = await prisma.menuCategory.findMany({
    include: {
      items: { include: { options: true, stockLinks: true } },
    },
  });

  let itemLinks = 0;
  let optionLinks = 0;

  for (const cat of categories) {
    for (const item of cat.items) {
      // Multi-insumo: regrava os vínculos (fonte de verdade é este seed).
      const multi = MULTI[item.name];
      if (multi) {
        await prisma.stockLink.deleteMany({ where: { menuItemId: item.id } });
        for (const [stock, qty] of multi) {
          await prisma.stockLink.create({
            data: {
              menuItemId: item.id,
              stockItemId: stockByName.get(stock)!,
              qtyMilli: toMilli(qty),
            },
          });
          itemLinks++;
        }
        continue;
      }

      // Peixes: proteína no nome da opção → vínculo na opção, com o tamanho
      // embutido (Meia = 0,5 / Inteira = 1).
      for (const opt of item.options) {
        const existing = await prisma.stockLink.count({
          where: { optionId: opt.id },
        });
        if (existing > 0) continue;
        const optNorm = opt.name.toLowerCase();
        const protein = Object.keys(OPTION_PROTEIN_TO_STOCK).find((p) =>
          optNorm.includes(p),
        );
        if (protein) {
          const qty = /meia|individual/.test(optNorm) ? 0.5 : 1;
          await prisma.stockLink.create({
            data: {
              optionId: opt.id,
              stockItemId: stockByName.get(OPTION_PROTEIN_TO_STOCK[protein])!,
              qtyMilli: toMilli(qty),
            },
          });
          optionLinks++;
        }
      }

      if (item.stockLinks.length > 0) continue;

      const special = ITEM_TO_STOCK[item.name];
      const targetName = special?.[0] ?? CATEGORY_TO_STOCK[cat.name];
      if (!targetName) continue;
      // Executivos são porção individual (0,5); demais, 1 porção por Inteira.
      const qty = special?.[1] ?? (/^executivo/i.test(item.name) ? 0.5 : 1);

      await prisma.stockLink.create({
        data: {
          menuItemId: item.id,
          stockItemId: stockByName.get(targetName)!,
          qtyMilli: toMilli(qty),
        },
      });
      itemLinks++;
    }
  }

  console.log(`Vínculos novos: ${itemLinks} pratos, ${optionLinks} opções`);
  console.log(
    'Sem vínculo (decidir no painel): Moqueca de Peixe/Bacalhau, iscas, saladas...',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
