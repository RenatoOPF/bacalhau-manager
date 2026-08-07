/** Nome da fila de pedidos no Redis/BullMQ. */
export const ORDERS_QUEUE = 'orders';

/**
 * Dois jobs separados por impressora: se a cozinha falhar e sofrer retry, o
 * caixa não é reimpresso — cada job só carrega responsabilidade pelo seu ticket.
 */
export const PRINT_CASHIER_JOB = 'print-cashier';
export const PRINT_KITCHEN_JOB = 'print-kitchen';

/** @deprecated Use PRINT_CASHIER_JOB / PRINT_KITCHEN_JOB */
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
