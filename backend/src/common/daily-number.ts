import { PrismaService } from '../prisma/prisma.service';

// Chave fixa do contador de pedidos (reaproveita a tabela DailyCounter).
// O número NÃO reinicia por data — reinicia quando o caixa é fechado.
const COUNTER_KEY = 'current';

/**
 * Próximo número de pedido. Sequência contínua que só reinicia quando o caixa
 * é fechado (ver resetOrderNumber). Atômico via INSERT ... ON CONFLICT — dois
 * pedidos simultâneos nunca recebem o mesmo número.
 */
export async function nextDailyNumber(prisma: PrismaService): Promise<number> {
  const rows = await prisma.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO "DailyCounter" ("date", "lastNumber") VALUES (${COUNTER_KEY}, 1)
    ON CONFLICT ("date")
    DO UPDATE SET "lastNumber" = "DailyCounter"."lastNumber" + 1
    RETURNING "lastNumber"
  `;
  return rows[0].lastNumber;
}

/** Zera a numeração de pedidos (chamado ao fechar o caixa). */
export async function resetOrderNumber(prisma: PrismaService): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "DailyCounter" ("date", "lastNumber") VALUES (${COUNTER_KEY}, 0)
    ON CONFLICT ("date") DO UPDATE SET "lastNumber" = 0
  `;
}
