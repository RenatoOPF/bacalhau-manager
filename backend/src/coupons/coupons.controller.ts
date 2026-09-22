import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';

@Controller('coupons')
export class CouponsController {
  constructor(private readonly svc: CouponsService) {}

  /** Valida um cupom e retorna o desconto — endpoint público usado no checkout. */
  @Get('validate/:code')
  async validate(
    @Param('code') code: string,
    @Query('total') total: string,
  ) {
    const totalCents = parseInt(total ?? '0', 10) || 0;
    const { coupon, discountCents } = await this.svc.validate(code, totalCents);
    return {
      valid: true,
      discountCents,
      description: coupon.description ?? null,
      type: coupon.type,
      value: coupon.value,
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  list() {
    return this.svc.list();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateCouponDto) {
    return this.svc.create(dto);
  }

  @Patch(':id/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  toggle(@Param('id') id: string) {
    return this.svc.toggleActive(id);
  }
}
