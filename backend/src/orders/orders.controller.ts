import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Cliente cria o pedido pelo cardápio. */
  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto);
  }

  /** Fila do caixa (opcionalmente filtrada por status). */
  @Get()
  list(@Query('status') status?: OrderStatus) {
    return this.orders.list(status);
  }

  /** Acompanhamento público do pedido pelo protocolo. */
  @Get('track/:protocol')
  track(@Param('protocol', ParseIntPipe) protocol: number) {
    return this.orders.findByProtocol(protocol);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orders.findOne(id);
  }

  /** Caixa/gerente atualiza o status (Recebido → Em preparo → Pronto → ...). */
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.orders.updateStatus(id, dto.status);
  }

  /** Reimpressão manual dos tickets. */
  @Post(':id/reprint')
  reprint(@Param('id') id: string) {
    return this.orders.reprint(id);
  }
}
