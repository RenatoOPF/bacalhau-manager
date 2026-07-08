import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import type { RedisOptions } from 'ioredis';
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

/**
 * Resolve a conexão do Redis a partir do ambiente.
 * - Produção/local: usa REDIS_HOST/REDIS_PORT (Redis nativo no PC do caixa).
 * - Redis em nuvem (opcional): defina REDIS_URL, com TLS quando `rediss://`.
 * `maxRetriesPerRequest: null` é exigido pelo BullMQ (conexões bloqueantes).
 */
function redisConnection(): RedisOptions {
  const base: RedisOptions = { maxRetriesPerRequest: null };
  const url = process.env.REDIS_URL;
  if (url) {
    const parsed = new URL(url);
    return {
      ...base,
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
    };
  }
  return {
    ...base,
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  };
}

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
  ],
})
export class AppModule {}
