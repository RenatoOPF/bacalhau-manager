import { Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryFeeZone, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateNeighborhoodDto,
  UpdateNeighborhoodDto,
} from './dto/neighborhood.dto';
import { CreateFeeZoneDto, UpdateFeeZoneDto } from './dto/fee-zone.dto';

const RESTAURANT_LAT = -9.660454;
const RESTAURANT_LNG = -35.7044501;

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

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

  // ---- Faixas de taxa por distância ----

  listZones(onlyActive = false) {
    return this.prisma.deliveryFeeZone.findMany({
      where: onlyActive ? { active: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { maxKm: 'asc' }],
    });
  }

  async createZone(dto: CreateFeeZoneDto) {
    const last = await this.prisma.deliveryFeeZone.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return this.prisma.deliveryFeeZone.create({
      data: {
        label: dto.label.trim(),
        maxKm: dto.maxKm,
        feeCents: dto.feeCents,
        courierFeeCents: dto.courierFeeCents ?? 0,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
  }

  async updateZone(id: string, dto: UpdateFeeZoneDto) {
    await this.ensureZoneExists(id);
    return this.prisma.deliveryFeeZone.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.maxKm !== undefined ? { maxKm: dto.maxKm } : {}),
        ...(dto.feeCents !== undefined ? { feeCents: dto.feeCents } : {}),
        ...(dto.courierFeeCents !== undefined
          ? { courierFeeCents: dto.courierFeeCents }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async removeZone(id: string) {
    await this.ensureZoneExists(id);
    await this.prisma.deliveryFeeZone.delete({ where: { id } });
    return { id };
  }

  /**
   * Calcula a taxa de entrega para as coordenadas do cliente.
   * Retorna a faixa ativa com menor `maxKm` que cobre a distância,
   * ou `zone: null` se o endereço estiver fora de todas as faixas.
   */
  async feeByDistance(
    lat: number,
    lng: number,
  ): Promise<{ distanceKm: number; zone: DeliveryFeeZone | null }> {
    const distanceKm = haversineKm(RESTAURANT_LAT, RESTAURANT_LNG, lat, lng);
    const zones = await this.prisma.deliveryFeeZone.findMany({
      where: { active: true },
      orderBy: { maxKm: 'asc' },
    });
    const zone = zones.find((z) => distanceKm <= z.maxKm) ?? null;
    return { distanceKm, zone };
  }

  private async ensureZoneExists(id: string) {
    const found = await this.prisma.deliveryFeeZone.findUnique({
      where: { id },
    });
    if (!found) throw new NotFoundException('Faixa de taxa não encontrada');
  }
}
