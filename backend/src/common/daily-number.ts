import { PrismaService } from '../prisma/prisma.service';
import { localDay } from './date-range';

/**
 * Próximo número de pedido do dia. Reinicia sozinho na virada do dia (fecha o
 * caixa automaticamente): cada dia usa sua própria chave no DailyCounter, então
 * o primeiro pedido de um novo dia volta a ser #1. O caixa também pode ser
 * fechado manualmente no meio do dia (ver resetOrderNumber).
 *
 * Atômico via INSERT ... ON CONFLICT — dois pedidos simultâneos nunca recebem
 * o mesmo número.
 */
export async function nextDailyNumber(prisma: PrismaService): Promise<number> {
  const day = localDay(new Date());
  const rows = await prisma.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO "DailyCounter" ("date", "lastNumber") VALUES (${day}, 1)
    ON CONFLICT ("date")
    DO UPDATE SET "lastNumber" = "DailyCounter"."lastNumber" + 1
    RETURNING "lastNumber"
  `;
  return rows[0].lastNumber;
}

/**
 * Fecha o caixa manualmente: zera o contador do dia atual, então o próximo
 * pedido de hoje volta a ser #1 (na virada do dia isso já acontece sozinho).
 */
export async function resetOrderNumber(prisma: PrismaService): Promise<void> {
  const day = localDay(new Date());
  await prisma.$executeRaw`
    INSERT INTO "DailyCounter" ("date", "lastNumber") VALUES (${day}, 0)
    ON CONFLICT ("date") DO UPDATE SET "lastNumber" = 0
  `;
}
