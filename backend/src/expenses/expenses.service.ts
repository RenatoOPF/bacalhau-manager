import { Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { periodFilter } from '../common/date-range';
import { CreateExpenseDto, UpdateExpenseDto } from './dto/expense.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista despesas. Filtra por competência (`dueDate`) no período e, opcional,
   * por categoria e status de pagamento (paid = com paidAt; unpaid = a pagar).
   */
  list(
    from?: string,
    to?: string,
    category?: ExpenseCategory,
    status?: 'paid' | 'unpaid',
  ) {
    const where: Prisma.ExpenseWhereInput = {};
    const dueDate = periodFilter(from, to);
    if (dueDate) where.dueDate = dueDate;
    if (category) where.category = category;
    if (status === 'paid') where.paidAt = { not: null };
    if (status === 'unpaid') where.paidAt = null;

    return this.prisma.expense.findMany({
      where,
      orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  create(dto: CreateExpenseDto) {
    return this.prisma.expense.create({
      data: {
        description: dto.description.trim(),
        category: dto.category,
        amountCents: dto.amountCents,
        dueDate: new Date(dto.dueDate),
        paidAt: dto.paidAt ? new Date(dto.paidAt) : null,
        recurring: dto.recurring ?? false,
        notes: dto.notes?.trim() || null,
      },
    });
  }

  async update(id: string, dto: UpdateExpenseDto) {
    await this.ensureExists(id);
    return this.prisma.expense.update({
      where: { id },
      data: {
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.amountCents !== undefined
          ? { amountCents: dto.amountCents }
          : {}),
        ...(dto.dueDate !== undefined ? { dueDate: new Date(dto.dueDate) } : {}),
        ...(dto.paidAt !== undefined
          ? { paidAt: dto.paidAt ? new Date(dto.paidAt) : null }
          : {}),
        ...(dto.recurring !== undefined ? { recurring: dto.recurring } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
      },
    });
  }

  /** Marca a despesa como paga agora (saída de caixa). */
  async pay(id: string) {
    await this.ensureExists(id);
    return this.prisma.expense.update({
      where: { id },
      data: { paidAt: new Date() },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.expense.delete({ where: { id } });
    return { id };
  }

  private async ensureExists(id: string) {
    const found = await this.prisma.expense.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Despesa não encontrada');
  }
}
