import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { IsInt, Max, Min } from 'class-validator';
import { OrderChannel, Role } from '@prisma/client';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

class SetCommissionDto {
  // Comissão em basis points (2300 = 23%).
  @IsInt()
  @Min(0)
  @Max(10000)
  commissionBps: number;
}

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('revenue')
  revenue(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.revenue(from, to);
  }

  @Get('summary')
  summary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.summary(from, to);
  }

  @Get('peak-hours')
  peakHours(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.peakHours(from, to);
  }

  @Get('cancellations')
  cancellations(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.cancellations(from, to);
  }

  @Get('products')
  products(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.products(from, to);
  }

  @Get('basket')
  basket(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reports.basket(from, to, limit ? Number(limit) : undefined);
  }

  @Get('margins')
  margins(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.margins(from, to);
  }

  @Get('dre')
  dre(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.dre(from, to);
  }

  @Get('cashflow')
  cashflow(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.cashflow(from, to);
  }

  @Get('couriers')
  couriers(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.couriers(from, to);
  }

  @Get('channel-config')
  channelConfig() {
    return this.reports.channelConfig();
  }

  @Patch('channel-config/:channel')
  setChannelConfig(
    @Param('channel') channel: OrderChannel,
    @Body() dto: SetCommissionDto,
  ) {
    return this.reports.setChannelConfig(channel, dto.commissionBps);
  }

  @Get('by-channel')
  byChannel(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.byChannel(from, to);
  }

  @Get('top-items')
  topItems(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reports.topItems(from, to, limit ? Number(limit) : undefined);
  }

  /** Exporta as transações do período como CSV (planilha). */
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="transacoes.csv"')
  async export(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const csv = await this.reports.exportCsv(from, to);
    res.send(csv);
  }
}
