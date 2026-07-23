import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { periodFilter } from '../common/date-range';
import {
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  UpdateExpenseCategoryDto,
  UpdateExpenseDto,
} from './dto/expense.dto';

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
    categoryId?: string,
    status?: 'paid' | 'unpaid',
  ) {
    const where: Prisma.ExpenseWhereInput = {};
    const dueDate = periodFilter(from, to);
    if (dueDate) where.dueDate = dueDate;
    if (categoryId) where.categoryId = categoryId;
    if (status === 'paid') where.paidAt = { not: null };
    if (status === 'unpaid') where.paidAt = null;

    return this.prisma.expense.findMany({
      where,
      orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        account: { select: { id: true, name: true, type: true } },
        category: { select: { id: true, name: true } },
      },
    });
  }

  create(dto: CreateExpenseDto) {
    return this.prisma.expense.create({
      data: {
        description: dto.description.trim(),
        categoryId: dto.categoryId || null,
        amountCents: dto.amountCents,
        dueDate: new Date(dto.dueDate),
        paidAt: dto.paidAt ? new Date(dto.paidAt) : null,
        accountId: dto.accountId || null,
        recurring: dto.recurring ?? false,
        notes: dto.notes?.trim() || null,
      },
    });
  }

  /**
   * Total por conta no período (por competência/`dueDate`): quanto já saiu
   * (pago) e quanto está previsto de cada conta. Inclui um balde "sem conta".
   */
  async byAccount(from?: string, to?: string) {
    const where: Prisma.ExpenseWhereInput = {};
    const dueDate = periodFilter(from, to);
    if (dueDate) where.dueDate = dueDate;

    const expenses = await this.prisma.expense.findMany({
      where,
      select: {
        amountCents: true,
        paidAt: true,
        account: { select: { id: true, name: true, type: true } },
      },
    });

    const map = new Map<
      string,
      {
        accountId: string | null;
        accountName: string;
        accountType: string | null;
        totalCents: number;
        paidCents: number;
      }
    >();
    for (const e of expenses) {
      const key = e.account?.id ?? '__none__';
      const bucket = map.get(key) ?? {
        accountId: e.account?.id ?? null,
        accountName: e.account?.name ?? 'Sem conta',
        accountType: e.account?.type ?? null,
        totalCents: 0,
        paidCents: 0,
      };
      bucket.totalCents += e.amountCents;
      if (e.paidAt) bucket.paidCents += e.amountCents;
      map.set(key, bucket);
    }

    return [...map.values()].sort((a, b) => b.totalCents - a.totalCents);
  }

  async update(id: string, dto: UpdateExpenseDto) {
    await this.ensureExists(id);
    return this.prisma.expense.update({
      where: { id },
      data: {
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.categoryId !== undefined
          ? { categoryId: dto.categoryId || null }
          : {}),
        ...(dto.amountCents !== undefined
          ? { amountCents: dto.amountCents }
          : {}),
        ...(dto.dueDate !== undefined ? { dueDate: new Date(dto.dueDate) } : {}),
        ...(dto.paidAt !== undefined
          ? { paidAt: dto.paidAt ? new Date(dto.paidAt) : null }
          : {}),
        ...(dto.accountId !== undefined
          ? { accountId: dto.accountId || null }
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

  // ---- Categorias (tipos de despesa) ----

  listCategories() {
    return this.prisma.expenseCategory.findMany({
      orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(dto: CreateExpenseCategoryDto) {
    // Próximo sortOrder no fim da lista.
    const last = await this.prisma.expenseCategory.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return this.prisma.expenseCategory.create({
      data: { name: dto.name.trim(), sortOrder: (last?.sortOrder ?? -1) + 1 },
    });
  }

  async updateCategory(id: string, dto: UpdateExpenseCategoryDto) {
    await this.ensureCategoryExists(id);
    return this.prisma.expenseCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  /** Exclui a categoria. As despesas vinculadas ficam sem categoria (SetNull). */
  async removeCategory(id: string) {
    await this.ensureCategoryExists(id);
    await this.prisma.expenseCategory.delete({ where: { id } });
    return { id };
  }

  private async ensureCategoryExists(id: string) {
    const found = await this.prisma.expenseCategory.findUnique({
      where: { id },
    });
    if (!found) throw new NotFoundException('Categoria não encontrada');
  }
}
