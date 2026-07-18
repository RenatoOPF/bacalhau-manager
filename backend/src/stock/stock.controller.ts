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
import { CreateStockItemDto, UpdateStockItemDto } from './dto/stock.dto';
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
