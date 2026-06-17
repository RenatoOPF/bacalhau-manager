import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('revenue')
  revenue(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.revenue(from, to);
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
