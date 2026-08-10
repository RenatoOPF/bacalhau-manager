import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAddressDto,
  CreateCustomerDto,
  UpdateAddressDto,
  UpdateCustomerDto,
} from './dto/customer.dto';

const ADDRESS_SELECT = {
  id: true,
  label: true,
  street: true,
  number: true,
  complement: true,
  neighborhood: true,
  reference: true,
  lat: true,
  lng: true,
  isDefault: true,
};

const CUSTOMER_BASE = {
  id: true,
  name: true,
  phone: true,
  notes: true,
  createdAt: true,
  addresses: { select: ADDRESS_SELECT, orderBy: { isDefault: 'desc' as const } },
};

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Busca por nome ou telefone (insensível a maiúsculas). */
  search(q: string) {
    return this.prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: CUSTOMER_BASE,
      orderBy: { name: 'asc' },
      take: 20,
    });
  }

  list() {
    return this.prisma.customer.findMany({
      select: CUSTOMER_BASE,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const c = await this.prisma.customer.findUnique({
      where: { id },
      select: {
        ...CUSTOMER_BASE,
        orders: {
          select: {
            id: true,
            protocol: true,
            dailyNumber: true,
            channel: true,
            status: true,
            totalCents: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!c) throw new NotFoundException('Cliente não encontrado');
    return c;
  }

  async create(dto: CreateCustomerDto) {
    if (dto.phone) await this.assertPhoneAvailable(dto.phone);
    return this.prisma.customer.create({
      data: { name: dto.name, phone: dto.phone, notes: dto.notes },
      select: CUSTOMER_BASE,
    });
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.findOne(id);
    if (dto.phone) await this.assertPhoneAvailable(dto.phone, id);
    return this.prisma.customer.update({
      where: { id },
      data: dto,
      select: CUSTOMER_BASE,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.customer.delete({ where: { id } });
    return { deleted: true };
  }

  async addAddress(customerId: string, dto: CreateAddressDto) {
    await this.findOne(customerId);
    if (dto.isDefault) await this.clearDefaultAddress(customerId);
    return this.prisma.customerAddress.create({
      data: { ...dto, customerId },
      select: ADDRESS_SELECT,
    });
  }

  async updateAddress(customerId: string, addressId: string, dto: UpdateAddressDto) {
    await this.assertAddressOwner(customerId, addressId);
    if (dto.isDefault) await this.clearDefaultAddress(customerId, addressId);
    return this.prisma.customerAddress.update({
      where: { id: addressId },
      data: dto,
      select: ADDRESS_SELECT,
    });
  }

  async removeAddress(customerId: string, addressId: string) {
    await this.assertAddressOwner(customerId, addressId);
    await this.prisma.customerAddress.delete({ where: { id: addressId } });
    return { deleted: true };
  }

  private async assertPhoneAvailable(phone: string, excludeId?: string) {
    const existing = await this.prisma.customer.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException('Telefone já cadastrado para outro cliente');
    }
  }

  private async assertAddressOwner(customerId: string, addressId: string) {
    const addr = await this.prisma.customerAddress.findUnique({
      where: { id: addressId },
      select: { customerId: true },
    });
    if (!addr || addr.customerId !== customerId) {
      throw new NotFoundException('Endereço não encontrado');
    }
  }

  private async clearDefaultAddress(customerId: string, exceptId?: string) {
    await this.prisma.customerAddress.updateMany({
      where: {
        customerId,
        isDefault: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { isDefault: false },
    });
  }
}
