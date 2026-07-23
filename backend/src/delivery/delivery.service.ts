import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateNeighborhoodDto,
  UpdateNeighborhoodDto,
} from './dto/neighborhood.dto';

@Injectable()
export class DeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Todos os bairros (ativos primeiro). `onlyActive` para o cardápio público. */
  list(onlyActive = false) {
    return this.prisma.neighborhood.findMany({
      where: onlyActive ? { active: true } : undefined,
      orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateNeighborhoodDto) {
    const last = await this.prisma.neighborhood.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return this.prisma.neighborhood.create({
      data: {
        name: dto.name.trim(),
        customerFeeCents: dto.customerFeeCents ?? 0,
        courierFeeCents: dto.courierFeeCents ?? 0,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
  }

  async update(id: string, dto: UpdateNeighborhoodDto) {
    await this.ensureExists(id);
    return this.prisma.neighborhood.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.customerFeeCents !== undefined
          ? { customerFeeCents: dto.customerFeeCents }
          : {}),
        ...(dto.courierFeeCents !== undefined
          ? { courierFeeCents: dto.courierFeeCents }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  /** Exclui o bairro. Pedidos vinculados ficam sem bairro (SetNull). */
  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.neighborhood.delete({ where: { id } });
    return { id };
  }

  /** Entregadores disponíveis para designação (funcionários ativos DELIVERY). */
  listCouriers() {
    return this.prisma.employee.findMany({
      where: { role: Role.DELIVERY, active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  private async ensureExists(id: string) {
    const found = await this.prisma.neighborhood.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Bairro não encontrado');
  }
}
