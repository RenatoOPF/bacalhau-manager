import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CashService } from './cash.service';
import { PayOrderDto } from './dto/pay-order.dto';

@Controller('cash')
export class CashController {
  constructor(private readonly cash: CashService) {}

  /** Registra pagamento recebido de um pedido. */
  @Post('orders/:id/pay')
  pay(@Param('id') id: string, @Body() dto: PayOrderDto) {
    return this.cash.payOrder(id, dto.paymentMethod);
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
