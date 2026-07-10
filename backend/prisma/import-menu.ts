/**
 * Importa o cardápio a partir de prisma/data/menu.json (gerado do produtos.xlsx
 * do sistema antigo). Idempotente: faz upsert por (categoria) e (categoria+item),
 * então rodar mais de uma vez não duplica.
 *
 * - Categorias e itens: nome em Título (a impressão converte para MAIÚSCULAS).
 * - Itens sem preço no export entram ocultos (available=false, preço 0) para o
 *   admin só preencher o valor depois.
 * - Desativa o cardápio-placeholder do seed (Pratos/Bebidas) sem apagar, para
 *   não conflitar com pedidos de teste que possam referenciá-lo.
 *
 * Uso: npm run menu:import --workspace backend
 */
import { PrismaClient } from '@prisma/client';
import menu from './data/menu.json';

const prisma = new PrismaClient();

async function main() {
  let catNew = 0;
  let catUpd = 0;
  let itemNew = 0;
  let itemUpd = 0;

  for (const c of menu.categories) {
    let cat = await prisma.menuCategory.findFirst({ where: { name: c.name } });
    if (cat) {
      cat = await prisma.menuCategory.update({
        where: { id: cat.id },
        data: { sortOrder: c.sortOrder, active: c.active },
      });
      catUpd++;
    } else {
      cat = await prisma.menuCategory.create({
        data: { name: c.name, sortOrder: c.sortOrder, active: c.active },
      });
      catNew++;
    }

    for (const it of c.items) {
      const existing = await prisma.menuItem.findFirst({
        where: { categoryId: cat.id, name: it.name },
      });
      const data = {
        description: it.description ?? null,
        priceCents: it.priceCents,
        available: it.available,
      };
      if (existing) {
        await prisma.menuItem.update({ where: { id: existing.id }, data });
        itemUpd++;
      } else {
        await prisma.menuItem.create({
          data: { categoryId: cat.id, name: it.name, ...data },
        });
        itemNew++;
      }
    }
  }

  // Desativa o cardápio-placeholder do seed inicial.
  const deact = await prisma.menuCategory.updateMany({
    where: { name: { in: ['Pratos', 'Bebidas'] } },
    data: { active: false },
  });

  console.log(`Categorias: +${catNew} novas, ${catUpd} atualizadas`);
  console.log(`Itens:      +${itemNew} novos, ${itemUpd} atualizados`);
  console.log(`Placeholder do seed desativado: ${deact.count} categoria(s)`);
  console.log('Importação do cardápio concluída.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
