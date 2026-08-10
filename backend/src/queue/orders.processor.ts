import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { PrintingService } from '../printing/printing.service';
import {
  ORDERS_QUEUE,
  PRINT_CASHIER_JOB,
  PRINT_KITCHEN_JOB,
  PrintOrderJobData,
} from './queue.constants';

/**
 * Consome a fila de pedidos com dois jobs distintos por impressora.
 *
 * Separar caixa e cozinha em jobs independentes evita duplicatas: se a
 * cozinha falhar e sofrer retry automático (BullMQ), o caixa não é
 * reimpresso porque o seu job já foi concluído com sucesso.
 */
@Processor(ORDERS_QUEUE)
export class OrdersProcessor extends WorkerHost {
  private readonly logger = new Logger(OrdersProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly printing: PrintingService,
  ) {
    super();
  }

  async process(job: Job<PrintOrderJobData>): Promise<void> {
    if (job.name !== PRINT_CASHIER_JOB && job.name !== PRINT_KITCHEN_JOB) return;

    const order = await this.prisma.order.findUnique({
      where: { id: job.data.orderId },
      include: { items: true },
    });

    if (!order) {
      this.logger.error(`Pedido ${job.data.orderId} não encontrado`);
      return;
    }

    if (job.name === PRINT_CASHIER_JOB) {
      await this.printing.printCashierTicket(order);
      this.logger.log(`Pedido #${order.protocol} — caixa impresso`);
    } else {
      await this.printing.printKitchenTicket(order);
      this.logger.log(`Pedido #${order.protocol} — cozinha impressa`);
    }
  }
}
