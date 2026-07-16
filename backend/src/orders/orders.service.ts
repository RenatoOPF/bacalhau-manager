import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  ORDERS_QUEUE,
  PRINT_ORDER_JOB,
  PrintOrderJobData,
} from '../queue/queue.constants';
import { CreateOrderDto } from './dto/create-order.dto';
import { nextDailyNumber } from '../common/daily-number';
import { dayRange, localDay } from '../common/date-range';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    @InjectQueue(ORDERS_QUEUE)
    private readonly ordersQueue: Queue<PrintOrderJobData>,
  ) {}

  /** Cria o pedido, enfileira a impressão e notifica o caixa em tempo real. */
  async create(dto: CreateOrderDto) {
    // Busca os itens do cardápio (com opções) para validar e congelar preços.
    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: dto.items.map((i) => i.menuItemId) } },
      include: { options: true },
    });
    const byId = new Map(menuItems.map((m) => [m.id, m]));

    let totalCents = 0;
    const itemsData = dto.items.map((input) => {
      const menuItem = byId.get(input.menuItemId);
      if (!menuItem || !menuItem.available) {
        throw new BadRequestException(
          `Item indisponível: ${input.menuItemId}`,
        );
      }

      // Item com opções: exige a escolha de uma opção disponível.
      if (menuItem.options.length > 0) {
        const option = menuItem.options.find((o) => o.id === input.optionId);
        if (!option || !option.available) {
          throw new BadRequestException(
            `Escolha uma opção válida para "${menuItem.name}"`,
          );
        }
        totalCents += option.priceCents * input.quantity;
        return {
          menuItemId: menuItem.id,
          nameSnapshot: menuItem.name,
          optionNameSnapshot: option.name,
          priceCents: option.priceCents,
          quantity: input.quantity,
          notes: input.notes,
        };
      }

      // Item simples: usa o preço próprio.
      totalCents += menuItem.priceCents * input.quantity;
      return {
        menuItemId: menuItem.id,
        nameSnapshot: menuItem.name,
        optionNameSnapshot: null,
        priceCents: menuItem.priceCents,
        quantity: input.quantity,
        notes: input.notes,
      };
    });

    const dailyNumber = await nextDailyNumber(this.prisma);

    const order = await this.prisma.order.create({
      data: {
        dailyNumber,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        addressStreet: dto.addressStreet,
        addressNumber: dto.addressNumber,
        addressComplement: dto.addressComplement,
        addressNeighborhood: dto.addressNeighborhood,
        addressReference: dto.addressReference,
        paymentMethod: dto.paymentMethod,
        notes: dto.notes,
        totalCents,
        items: { create: itemsData },
      },
      include: { items: true },
    });

    // Enfileira a impressão — a fila garante o reprocessamento se falhar.
    await this.ordersQueue.add(PRINT_ORDER_JOB, { orderId: order.id });

    this.realtime.emitOrderCreated(order);
    return order;
  }

  /** Fila do caixa: apenas os pedidos do dia atual (ou filtrados por status). */
  list(status?: OrderStatus) {
    const { start, end } = dayRange(localDay(new Date()));
    return this.prisma.order.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    return order;
  }

  /** Acompanhamento público pelo protocolo (sem expor endereço completo). */
  async findByProtocol(protocol: number) {
    const order = await this.prisma.order.findUnique({
      where: { protocol },
      select: {
        protocol: true,
        dailyNumber: true,
        status: true,
        createdAt: true,
        items: {
          select: {
            nameSnapshot: true,
            optionNameSnapshot: true,
            quantity: true,
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    return order;
  }

  /** Atualização de status feita pelo caixa/gerente (não há tela da cozinha no MVP). */
  async updateStatus(id: string, status: OrderStatus) {
    const order = await this.prisma.order.update({
      where: { id },
      data: { status },
      include: { items: true },
    });
    this.realtime.emitOrderStatusChanged(order);
    return order;
  }

  /** Reimpressão manual em caso de falha. */
  async reprint(id: string) {
    const order = await this.findOne(id);
    await this.ordersQueue.add(PRINT_ORDER_JOB, { orderId: order.id });
    return { enqueued: true, protocol: order.protocol };
  }

  /** Exclui o pedido (e seus itens, em cascata). */
  async deleteOrder(id: string) {
    const order = await this.findOne(id);
    await this.prisma.order.delete({ where: { id: order.id } });
    return { deleted: true, protocol: order.protocol };
  }
}
