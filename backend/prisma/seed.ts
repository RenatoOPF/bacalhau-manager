import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const pratos = await prisma.menuCategory.create({
    data: { name: 'Pratos', sortOrder: 1 },
  });
  const bebidas = await prisma.menuCategory.create({
    data: { name: 'Bebidas', sortOrder: 2 },
  });

  await prisma.menuItem.createMany({
    data: [
      {
        categoryId: pratos.id,
        name: 'Bacalhau à Lagareiro',
        description: 'Lombo de bacalhau com batatas ao murro e azeite.',
        priceCents: 8900,
      },
      {
        categoryId: pratos.id,
        name: 'Bolinho de Bacalhau (6un)',
        description: 'Tradicional bolinho crocante.',
        priceCents: 3500,
      },
      {
        categoryId: bebidas.id,
        name: 'Refrigerante Lata',
        priceCents: 700,
      },
    ],
  });

  console.log('Seed concluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
