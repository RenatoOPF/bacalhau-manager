import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { ConfirmPlatformService } from './confirm-platform.service';
import { StockModule } from '../stock/stock.module';
import { CouponsModule } from '../coupons/coupons.module';

@Module({
  imports: [StockModule, CouponsModule],
  controllers: [OrdersController],
  providers: [OrdersService, ConfirmPlatformService],
})
export class OrdersModule {}
