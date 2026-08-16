import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { redisConnection } from '../redis.config';

const REDIS_KEY = 'config:print:enabled';

@Injectable()
export class PrintConfigService implements OnModuleInit {
  private readonly logger = new Logger(PrintConfigService.name);
  private readonly redis = new Redis(redisConnection());
  private enabled = true;

  async onModuleInit() {
    try {
      const val = await this.redis.get(REDIS_KEY);
      if (val !== null) {
        this.enabled = val === '1';
        this.logger.log(`Impressão carregada do Redis: ${this.enabled ? 'habilitada' : 'desabilitada'}`);
      }
    } catch (err) {
      this.logger.warn(`Não foi possível ler config de impressão do Redis: ${err}`);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    this.redis.set(REDIS_KEY, value ? '1' : '0').catch((err) =>
      this.logger.error(`Falha ao persistir config de impressão: ${err}`),
    );
  }
}
