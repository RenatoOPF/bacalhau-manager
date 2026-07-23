import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { DeliveryService } from './delivery.service';
import {
  CreateNeighborhoodDto,
  UpdateNeighborhoodDto,
} from './dto/neighborhood.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller()
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  /** Bairros ativos — público (o cardápio do cliente usa para a taxa). */
  @Get('neighborhoods')
  listPublic() {
    return this.delivery.list(true);
  }

  /** Todos os bairros (admin). */
  @Get('neighborhoods/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  listAll() {
    return this.delivery.list(false);
  }

  /** Entregadores disponíveis para designação. */
  @Get('couriers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  couriers() {
    return this.delivery.listCouriers();
  }

  @Post('neighborhoods')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateNeighborhoodDto) {
    return this.delivery.create(dto);
  }

  @Patch('neighborhoods/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateNeighborhoodDto) {
    return this.delivery.update(id, dto);
  }

  @Delete('neighborhoods/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.delivery.remove(id);
  }
}
