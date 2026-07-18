import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { redisConnection } from './redis.config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EmployeesModule } from './employees/employees.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { CashModule } from './cash/cash.module';
import { ReportsModule } from './reports/reports.module';
import { QueueModule } from './queue/queue.module';
import { PrintingModule } from './printing/printing.module';
import { RealtimeModule } from './realtime/realtime.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { StockModule } from './stock/stock.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Conexão única do BullMQ com o Redis, compartilhada por todas as filas.
    BullModule.forRoot({ connection: redisConnection() }),
    PrismaModule,
    AuthModule,
    EmployeesModule,
    RealtimeModule,
    PrintingModule,
    QueueModule,
    MenuModule,
    OrdersModule,
    CashModule,
    ReportsModule,
    IntegrationsModule,
    StockModule,
  ],
})
export class AppModule {}
