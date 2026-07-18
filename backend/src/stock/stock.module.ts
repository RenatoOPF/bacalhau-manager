import { Module } from '@nestjs/common';
import { StockService } from './stock.service';
import { StockController } from './stock.controller';

@Module({
  controllers: [StockController],
  providers: [StockService],
  // Exportado para OrdersModule/IntegrationsModule baixarem/estornarem estoque.
  exports: [StockService],
})
export class StockModule {}
