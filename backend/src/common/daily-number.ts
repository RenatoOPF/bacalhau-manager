import { PrismaService } from '../prisma/prisma.service';
import { localDay } from './date-range';

/**
 * Próximo número de pedido do dia (reinicia a cada dia, fuso do servidor).
 *
 * Atômico: um único `INSERT ... ON CONFLICT DO UPDATE` no contador diário
 * garante que dois pedidos simultâneos nunca recebam o mesmo número.
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
