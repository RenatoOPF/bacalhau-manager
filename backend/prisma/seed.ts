import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedAdmin() {
  const count = await prisma.employee.count();
  if (count > 0) {
    console.log('Funcionários já existem — admin não recriado.');
    return;
  }
  const username = process.env.SEED_ADMIN_USERNAME ?? 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';
  await prisma.employee.create({
    data: {
      name: 'Administrador',
      username,
      role: Role.ADMIN,
      passwordHash: await bcrypt.hash(password, 10),
    },
  });
  console.log(`Admin criado: usuário "${username}" (troque a senha após o login).`);
}

async function seedMenu() {
  const count = await prisma.menuCategory.count();
  if (count > 0) {
    console.log('Cardápio já populado — seed de menu pulado.');
    return;
  }
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
  console.log('Cardápio inicial criado.');
}

async function main() {
  await seedAdmin();
  await seedMenu();
  console.log('Seed concluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
