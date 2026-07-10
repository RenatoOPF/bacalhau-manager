/**
 * Importa o cardápio a partir de prisma/data/menu.json (gerado do produtos.xlsx
 * do sistema antigo). Idempotente: upsert por (categoria) e (categoria+item),
 * e as opções de cada item são regravadas a cada execução.
 *
 * - Itens com variação de porção viram 1 item com várias opções
 *   (ex.: Individual/Inteira); o preço vem da opção.
 * - Nomes em Título (a impressão converte para MAIÚSCULAS).
 * - Remove itens órfãos das categorias importadas (ex.: as variações "flat"
 *   de uma importação anterior) — deleta se não houver pedido referenciando,
 *   senão apenas desativa.
 * - Desativa o cardápio-placeholder do seed (Pratos/Bebidas).
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
  let optCount = 0;
  const canonicalByCat = new Map<string, Set<string>>();

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

    const names = new Set<string>();
    for (const it of c.items) {
      names.add(it.name);
      const data = {
        description: it.description ?? null,
        priceCents: it.priceCents,
        available: it.available,
      };
      let item = await prisma.menuItem.findFirst({
        where: { categoryId: cat.id, name: it.name },
      });
      if (item) {
        await prisma.menuItem.update({ where: { id: item.id }, data });
        itemUpd++;
      } else {
        item = await prisma.menuItem.create({
          data: { categoryId: cat.id, name: it.name, ...data },
        });
        itemNew++;
      }

      // Regrava as opções do item (idempotente).
      const itemId = item.id;
      await prisma.menuItemOption.deleteMany({ where: { menuItemId: itemId } });
      if (it.options.length > 0) {
        await prisma.menuItemOption.createMany({
          data: it.options.map((o, idx) => ({
            menuItemId: itemId,
            name: o.name,
            priceCents: o.priceCents,
            sortOrder: o.sortOrder ?? idx + 1,
          })),
        });
        optCount += it.options.length;
      }
    }
    canonicalByCat.set(cat.id, names);
  }

  // Limpa itens órfãos (variações "flat" da importação antiga).
  let removed = 0;
  let deactivated = 0;
  for (const [catId, names] of canonicalByCat) {
    const existing = await prisma.menuItem.findMany({
      where: { categoryId: catId },
      include: { _count: { select: { orderItems: true } } },
    });
    for (const item of existing) {
      if (names.has(item.name)) continue;
      if (item._count.orderItems === 0) {
        await prisma.menuItemOption.deleteMany({ where: { menuItemId: item.id } });
        await prisma.menuItem.delete({ where: { id: item.id } });
        removed++;
      } else {
        await prisma.menuItem.update({
          where: { id: item.id },
          data: { available: false },
        });
        deactivated++;
      }
    }
  }

  const deact = await prisma.menuCategory.updateMany({
    where: { name: { in: ['Pratos', 'Bebidas'] } },
    data: { active: false },
  });

  console.log(`Categorias: +${catNew} novas, ${catUpd} atualizadas`);
  console.log(`Itens:      +${itemNew} novos, ${itemUpd} atualizados`);
  console.log(`Opções gravadas: ${optCount}`);
  console.log(`Órfãos: ${removed} removidos, ${deactivated} desativados`);
  console.log(`Placeholder do seed desativado: ${deact.count} categoria(s)`);
  console.log('Importação do cardápio concluída.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
