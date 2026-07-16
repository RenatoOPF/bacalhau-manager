import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CashService } from './cash.service';
import { PayOrderDto } from './dto/pay-order.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('cash')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class CashController {
  constructor(private readonly cash: CashService) {}

  /** Registra pagamento recebido de um pedido. */
  @Post('orders/:id/pay')
  pay(@Param('id') id: string, @Body() dto: PayOrderDto) {
    return this.cash.payOrder(id, dto.paymentMethod);
  }

  /** Fecha o caixa manualmente: zera a numeração do dia (o próximo volta a #1). */
  @Post('close')
  close() {
    return this.cash.close();
  }

  /** Pedidos pendentes de pagamento. */
  @Get('pending')
  pending() {
    return this.cash.pendingPayments();
  }

  /** Histórico de transações por período (datas YYYY-MM-DD). */
  @Get('transactions')
  transactions(@Query('from') from?: string, @Query('to') to?: string) {
    return this.cash.transactions(from, to);
  }

  /** Fechamento diário (totais por modalidade). Data padrão: hoje. */
  @Get('summary')
  summary(@Query('date') date?: string) {
    const day = date ?? new Date().toISOString().slice(0, 10);
    return this.cash.dailySummary(day);
  }
}
