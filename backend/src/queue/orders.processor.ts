import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { PrintingService } from '../printing/printing.service';
import {
  ORDERS_QUEUE,
  PRINT_ORDER_JOB,
  PrintOrderJobData,
} from './queue.constants';

/**
 * Consome a fila de pedidos. Para cada pedido recebido, imprime o ticket
 * do caixa e o ticket da cozinha. Se a impressão falhar, o BullMQ
 * reprocessa o job automaticamente (retries configurados ao enfileirar) —
 * é isso que garante que "nenhum pedido se perca".
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
    if (job.name !== PRINT_ORDER_JOB) return;

    const order = await this.prisma.order.findUnique({
      where: { id: job.data.orderId },
      include: { items: true },
    });

    if (!order) {
      this.logger.error(`Pedido ${job.data.orderId} não encontrado`);
      return;
    }

    // Caixa primeiro (ponto central), depois cozinha.
    await this.printing.printCashierTicket(order);
    await this.printing.printKitchenTicket(order);

    this.logger.log(`Pedido #${order.protocol} impresso com sucesso`);
  }
}
