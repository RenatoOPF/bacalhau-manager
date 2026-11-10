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
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrderStatus, Role } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  ConfirmPlatformDto,
  UpdateCourierStatusDto,
  UpdateStatusDto,
} from './dto/update-status.dto';
import { AssignDeliveryDto } from './dto/assign-delivery.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly jwt: JwtService,
  ) {}

  /** Cliente cria o pedido pelo cardápio (público) ou operador cria pelo balcão (autenticado). */
  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async create(@Body() dto: CreateOrderDto, @Req() req: Request) {
    let isStaff = false;
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const payload = await this.jwt.verifyAsync<{ role?: Role }>(
          header.slice('Bearer '.length),
        );
        isStaff =
          payload.role === Role.ADMIN || payload.role === Role.MANAGER;
      } catch {
        // Token ausente/expirado no cardápio público: segue como cliente comum.
      }
    }
    return this.orders.create(dto, { isStaff });
  }

  /** Acompanhamento público do pedido pelo protocolo (sem endereço). */
  @Get('track/:protocol')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  track(@Param('protocol', ParseIntPipe) protocol: number) {
    return this.orders.findByProtocol(protocol);
  }

  /** Pedidos atribuídos ao entregador autenticado. Sem datas = hoje. */
  @Get('courier/mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DELIVERY)
  listMine(
    @Req() req: Request & { user: { sub: string } },
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.orders.listForCourier(req.user.sub, from, to);
  }

  /** Entregador atualiza o status do seu pedido (saiu/entregue). */
  @Patch('courier/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DELIVERY)
  updateCourierStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCourierStatusDto,
    @Req() req: Request & { user: { sub: string } },
  ) {
    return this.orders.updateCourierStatus(id, req.user.sub, dto.status);
  }

  /** Entregador confirma entrega na plataforma (iFood/99Food) com código do cliente. */
  @Post('courier/:id/confirm-platform')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DELIVERY)
  confirmOnPlatform(
    @Param('id') id: string,
    @Body() dto: ConfirmPlatformDto,
    @Req() req: Request & { user: { sub: string } },
  ) {
    return this.orders.confirmOnPlatform(id, req.user.sub, dto.customerCode);
  }

  /** Fila do caixa (opcionalmente filtrada por status). */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  list(@Query('status') status?: OrderStatus) {
    return this.orders.list(status);
  }

  /** Visão pública da cozinha: pedidos ativos sem dados pessoais. */
  @Get('kitchen')
  kitchen() {
    return this.orders.listForKitchen();
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

  /** Reimpressão manual dos tickets. ?target=cashier|kitchen (padrão: both) */
  @Post(':id/reprint')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  reprint(
    @Param('id') id: string,
    @Query('target') target?: 'cashier' | 'kitchen',
  ) {
    return this.orders.reprint(id, target ?? 'both');
  }

  /** Exclui um pedido (ex.: pedido de teste ou lançado por engano). */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.orders.deleteOrder(id);
  }
}
