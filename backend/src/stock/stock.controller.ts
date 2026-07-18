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
import { StockService } from './stock.service';
import {
  CreateStockItemDto,
  CreateStockLinkDto,
  ProduceDto,
  UpdateStockItemDto,
  UpdateStockLinkDto,
} from './dto/stock.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('stock')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get()
  list() {
    return this.stock.list();
  }

  @Post()
  create(@Body() dto: CreateStockItemDto) {
    return this.stock.create(dto);
  }

  /** Produção manual: ex. 1 kg de bacalhau → 3 porções de desfiado. */
  @Post('produce')
  produce(@Body() dto: ProduceDto) {
    return this.stock.produce(dto);
  }

  // ---- Vínculos prato/opção → insumo ----

  @Post('links')
  createLink(@Body() dto: CreateStockLinkDto) {
    return this.stock.createLink(dto);
  }

  @Patch('links/:id')
  updateLink(@Param('id') id: string, @Body() dto: UpdateStockLinkDto) {
    return this.stock.updateLink(id, dto);
  }

  @Delete('links/:id')
  removeLink(@Param('id') id: string) {
    return this.stock.removeLink(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStockItemDto) {
    return this.stock.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.stock.remove(id);
  }

  @Get(':id/movements')
  movements(@Param('id') id: string) {
    return this.stock.movements(id);
  }
}
