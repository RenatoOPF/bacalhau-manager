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
import { AssignDeliveryDto } from './dto/assign-delivery.dto';
import { nextDailyNumber } from '../common/daily-number';
import { dayRange, localDay } from '../common/date-range';
import { StockService } from '../stock/stock.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly stock: StockService,
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

    // Bairro escolhido define a taxa cobrada do cliente (some ao total).
    let deliveryFeeCents = 0;
    let neighborhoodName: string | undefined;
    if (dto.neighborhoodId) {
      const n = await this.prisma.neighborhood.findUnique({
        where: { id: dto.neighborhoodId },
      });
      if (n) {
        deliveryFeeCents = n.customerFeeCents;
        neighborhoodName = n.name;
      }
    }

    const dailyNumber = await nextDailyNumber(this.prisma);

    const order = await this.prisma.order.create({
      data: {
        dailyNumber,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        addressStreet: dto.addressStreet,
        addressNumber: dto.addressNumber,
        addressComplement: dto.addressComplement,
        // Preserva o nome do bairro no texto do endereço (comanda/relatório).
        addressNeighborhood: dto.addressNeighborhood ?? neighborhoodName,
        addressReference: dto.addressReference,
        neighborhoodId: dto.neighborhoodId || null,
        paymentMethod: dto.paymentMethod,
        notes: dto.notes,
        totalCents: totalCents + deliveryFeeCents,
        deliveryFeeCents,
        items: { create: itemsData },
      },
      include: { items: true },
    });

    // Enfileira a impressão — a fila garante o reprocessamento se falhar.
    await this.ordersQueue.add(PRINT_ORDER_JOB, { orderId: order.id });

    // Baixa o estoque (nunca lança — falha só é registrada no log).
    await this.stock.consumeForOrder(order);

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
      include: {
        items: true,
        courier: { select: { id: true, name: true } },
      },
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
    if (status === OrderStatus.CANCELED) {
      await this.stock.restoreForOrder(
        order.id,
        `Estorno — pedido #${order.protocol} cancelado`,
      );
    }
    this.realtime.emitOrderStatusChanged(order);
    return order;
  }

  /**
   * Designa o entregador do pedido e registra os snapshots das taxas. Quando um
   * bairro é informado sem os valores, puxa a taxa do cliente e o repasse do
   * cadastro do bairro. Chamado pelo caixa ao mandar "Saiu para entrega".
   */
  async assignDelivery(id: string, dto: AssignDeliveryDto) {
    const existing = await this.prisma.order.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Pedido não encontrado');

    let { courierFeeCents, deliveryFeeCents } = dto;
    if (dto.neighborhoodId) {
      const n = await this.prisma.neighborhood.findUnique({
        where: { id: dto.neighborhoodId },
      });
      if (n) {
        if (courierFeeCents === undefined) courierFeeCents = n.courierFeeCents;
        if (deliveryFeeCents === undefined)
          deliveryFeeCents = n.customerFeeCents;
      }
    }

    const order = await this.prisma.order.update({
      where: { id },
      data: {
        ...(dto.courierId !== undefined ? { courierId: dto.courierId } : {}),
        ...(dto.neighborhoodId !== undefined
          ? { neighborhoodId: dto.neighborhoodId }
          : {}),
        ...(courierFeeCents !== undefined ? { courierFeeCents } : {}),
        ...(deliveryFeeCents !== undefined ? { deliveryFeeCents } : {}),
      },
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
    // Estorna antes de excluir (as movimentações guardam o orderId).
    await this.stock.restoreForOrder(
      order.id,
      `Estorno — pedido #${order.protocol} excluído`,
    );
    await this.prisma.order.delete({ where: { id: order.id } });
    return { deleted: true, protocol: order.protocol };
  }
}
