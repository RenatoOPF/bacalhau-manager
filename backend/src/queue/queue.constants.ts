/** Nome da fila de pedidos no Redis/BullMQ. */
export const ORDERS_QUEUE = 'orders';

/** Tipos de job processados pela fila de pedidos. */
export const PRINT_ORDER_JOB = 'print-order';

export interface PrintOrderJobData {
  orderId: string;
}
