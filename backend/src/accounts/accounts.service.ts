import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Contas ativas primeiro, depois pela ordem/nome. */
  list() {
    return this.prisma.paymentAccount.findMany({
      orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  create(dto: CreateAccountDto) {
    return this.prisma.paymentAccount.create({
      data: { name: dto.name.trim(), type: dto.type },
    });
  }

  async update(id: string, dto: UpdateAccountDto) {
    await this.ensureExists(id);
    return this.prisma.paymentAccount.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  /** Exclui a conta. As despesas vinculadas ficam sem conta (SetNull). */
  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.paymentAccount.delete({ where: { id } });
    return { id };
  }

  private async ensureExists(id: string) {
    const found = await this.prisma.paymentAccount.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Conta não encontrada');
  }
}
