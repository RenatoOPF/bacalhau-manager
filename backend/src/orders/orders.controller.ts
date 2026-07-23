import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { AssignDeliveryDto } from './dto/assign-delivery.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Cliente cria o pedido pelo cardápio (público). */
  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto);
  }

  /** Acompanhamento público do pedido pelo protocolo (sem endereço). */
  @Get('track/:protocol')
  track(@Param('protocol', ParseIntPipe) protocol: number) {
    return this.orders.findByProtocol(protocol);
  }

  /** Fila do caixa (opcionalmente filtrada por status). */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  list(@Query('status') status?: OrderStatus) {
    return this.orders.list(status);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  findOne(@Param('id') id: string) {
    return this.orders.findOne(id);
  }

  /** Caixa/gerente atualiza o status (Recebido → Em preparo → Pronto → ...). */
  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.orders.updateStatus(id, dto.status);
  }

  /** Designa entregador e registra as taxas da entrega (feito pelo caixa). */
  @Patch(':id/delivery')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  assignDelivery(@Param('id') id: string, @Body() dto: AssignDeliveryDto) {
    return this.orders.assignDelivery(id, dto);
  }

  /** Reimpressão manual dos tickets. */
  @Post(':id/reprint')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  reprint(@Param('id') id: string) {
    return this.orders.reprint(id);
  }

  /** Exclui um pedido (ex.: pedido de teste ou lançado por engano). */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.orders.deleteOrder(id);
  }
}
