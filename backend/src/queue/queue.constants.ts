/** Nome da fila de pedidos no Redis/BullMQ. */
export const ORDERS_QUEUE = 'orders';

/** Tipos de job processados pela fila de pedidos. */
export const PRINT_ORDER_JOB = 'print-order';

/**
 * Opções aplicadas a cada job de impressão. Precisam valer no lado PRODUTOR
 * (backend na nuvem), pois o BullMQ grava retry/backoff no job ao enfileirar;
 * o agente local que consome apenas obedece a essa config.
 */
export const ORDERS_JOB_OPTIONS = {
  // Reprocessa até 5x com backoff exponencial se a impressão falhar.
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 3000 },
  removeOnComplete: 1000,
  removeOnFail: false,
};

export interface PrintOrderJobData {
  orderId: string;
}
