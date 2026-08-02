import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { DeliveryService } from './delivery.service';
import {
  CreateNeighborhoodDto,
  UpdateNeighborhoodDto,
} from './dto/neighborhood.dto';
import { CreateFeeZoneDto, UpdateFeeZoneDto } from './dto/fee-zone.dto';
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

  // ---- Faixas de taxa por distância ----

  /** Faixas ativas — público (checkout usa para exibir tabela de taxas). */
  @Get('fee-zones')
  listZonesPublic() {
    return this.delivery.listZones(true);
  }

  @Get('fee-zones/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  listZonesAll() {
    return this.delivery.listZones(false);
  }

  /**
   * Calcula a taxa de entrega para as coordenadas do cliente.
   * Público — chamado pelo checkout após geocodificação do endereço.
   * Retorna `zone: null` se o endereço estiver fora das faixas cadastradas.
   */
  @Get('delivery/fee')
  async feeByDistance(
    @Query('lat') latStr: string,
    @Query('lng') lngStr: string,
  ) {
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new BadRequestException('lat e lng devem ser números válidos.');
    }
    return this.delivery.feeByDistance(lat, lng);
  }

  @Post('fee-zones')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  createZone(@Body() dto: CreateFeeZoneDto) {
    return this.delivery.createZone(dto);
  }

  @Patch('fee-zones/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateZone(@Param('id') id: string, @Body() dto: UpdateFeeZoneDto) {
    return this.delivery.updateZone(id, dto);
  }

  @Delete('fee-zones/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  removeZone(@Param('id') id: string) {
    return this.delivery.removeZone(id);
  }
}
