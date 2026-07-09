import type { RedisOptions } from 'ioredis';

/**
 * Resolve a conexão do Redis a partir do ambiente. Compartilhada pelo backend
 * (produtor da fila, na nuvem) e pelo agente de impressão (consumidor, no PC
 * do caixa) — os dois apontam para o MESMO Redis.
 *
 * - Nuvem (recomendado): defina `REDIS_URL` (ex.: Upstash `rediss://...`).
 *   Com `rediss://` o TLS é ligado automaticamente.
 * - Dev/local: cai para REDIS_HOST/REDIS_PORT (Redis nativo).
 *
 * `maxRetriesPerRequest: null` é exigido pelo BullMQ (conexões bloqueantes).
 */
export function redisConnection(): RedisOptions {
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
