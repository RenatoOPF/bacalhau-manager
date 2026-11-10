import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CouponType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCouponDto } from './dto/create-coupon.dto';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create(dto: CreateCouponDto) {
    const code = dto.code.toUpperCase();
    const exists = await this.prisma.coupon.findUnique({ where: { code } });
    if (exists) throw new BadRequestException('Código de cupom já existe');

    if (dto.type === CouponType.PERCENT && dto.value > 100) {
      throw new BadRequestException('Desconto percentual não pode ser maior que 100%');
    }

    return this.prisma.coupon.create({
      data: {
        code,
        description: dto.description,
        type: dto.type,
        value: dto.value,
        minOrderCents: dto.minOrderCents ?? 0,
        maxUses: dto.maxUses ?? null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  async toggleActive(id: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('Cupom não encontrado');
    return this.prisma.coupon.update({
      where: { id },
      data: { active: !coupon.active },
    });
  }

  /**
   * Valida um cupom e retorna o desconto em centavos para o total dado.
   * Lança BadRequestException com a razão caso inválido.
   */
  async validate(code: string, itemsTotalCents: number) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!coupon || !coupon.active) {
      throw new BadRequestException('Cupom inválido ou inativo');
    }
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new BadRequestException('Cupom expirado');
    }
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      throw new BadRequestException('Cupom esgotado');
    }
    if (itemsTotalCents < coupon.minOrderCents) {
      throw new BadRequestException(
        `Pedido mínimo para este cupom: R$ ${(coupon.minOrderCents / 100).toFixed(2).replace('.', ',')}`,
      );
    }

    const discountCents =
      coupon.type === CouponType.PERCENT
        ? Math.round((itemsTotalCents * coupon.value) / 100)
        : Math.min(coupon.value, itemsTotalCents);

    return { coupon, discountCents };
  }

  /** Incrementa usedCount atomicamente respeitando maxUses; lança se esgotado. */
  async claimCoupon(id: string, maxUses: number | null) {
    const res = await this.prisma.coupon.updateMany({
      where: {
        id,
        active: true,
        ...(maxUses !== null ? { usedCount: { lt: maxUses } } : {}),
      },
      data: { usedCount: { increment: 1 } },
    });
    if (res.count === 0) {
      throw new BadRequestException('Cupom esgotado');
    }
  }

  /** Decrementa usedCount ao cancelar ou excluir pedido que usou o cupom. */
  async releaseCoupon(id: string) {
    await this.prisma.coupon.updateMany({
      where: { id, usedCount: { gt: 0 } },
      data: { usedCount: { decrement: 1 } },
    });
  }
}
