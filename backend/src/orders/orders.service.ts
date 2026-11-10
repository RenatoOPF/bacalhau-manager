import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderChannel, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateOrderDto } from './dto/create-order.dto';
import { AssignDeliveryDto } from './dto/assign-delivery.dto';
import { nextDailyNumber } from '../common/daily-number';
import { dayRange, localDay, periodFilter } from '../common/date-range';
import { StockService } from '../stock/stock.service';
import { PrintConfigService } from '../printing/print-config.service';
import { CouponsService } from '../coupons/coupons.service';
import { ConfirmPlatformService } from './confirm-platform.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly stock: StockService,
    private readonly printConfig: PrintConfigService,
    private readonly coupons: CouponsService,
    private readonly confirmPlatform: ConfirmPlatformService,
  ) {}

  /** Cria o pedido, enfileira a impressão e notifica o caixa em tempo real. */
  async create(dto: CreateOrderDto, opts?: { isStaff?: boolean }) {
    const isStaff = opts?.isStaff ?? false;
    // Busca os itens do cardápio (com opções) para validar e congelar preços.
    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: dto.items.map((i) => i.menuItemId) } },
      include: { options: true },
    });
    const byId = new Map(menuItems.map((m) => [m.id, m]));

    // Estimador de custo carregado uma vez para todos os itens do pedido.
    const costOf = await this.stock.buildCostEstimator();

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
          unitCostCents: costOf(menuItem.name, option.name, null, menuItem.id, option.id),
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
        unitCostCents: costOf(menuItem.name, null, null, menuItem.id, null),
        quantity: input.quantity,
        notes: input.notes,
      };
    });

    // Taxa de entrega: lookup pelo bairro cadastrado.
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
    const customerPhone = dto.customerPhone?.replace(/\D/g, '') || undefined;

    // Cupom: tem precedência sobre discountCents manual quando informado.
    // Desconto manual (discountCents) e customerId direto só são aceitos quando
    // enviados por um operador autenticado (ADMIN / MANAGER no balcão).
    let discountCents = isStaff ? (dto.discountCents ?? 0) : 0;
    const customerId = isStaff ? (dto.customerId ?? null) : null;
    let couponId: string | null = null;
    let couponCode: string | null = null;
    if (dto.couponCode) {
      const result = await this.coupons.validate(dto.couponCode, totalCents);
      await this.coupons.claimCoupon(result.coupon.id, result.coupon.maxUses);
      discountCents = result.discountCents;
      couponId = result.coupon.id;
      couponCode = result.coupon.code;
    }

    let order;
    try {
      order = await this.prisma.order.create({
        data: {
          dailyNumber,
          customerId,
          customerName: dto.customerName,
          customerPhone,
          addressStreet: dto.addressStreet ?? 'Balcão',
          addressNumber: dto.addressNumber,
          addressComplement: dto.addressComplement,
          addressNeighborhood: dto.addressNeighborhood ?? neighborhoodName,
          addressReference: dto.addressReference,
          addressLat: dto.addressLat ?? null,
          addressLng: dto.addressLng ?? null,
          neighborhoodId: dto.neighborhoodId || null,
          paymentMethod: dto.paymentMethod,
          notes: dto.notes,
          totalCents: Math.max(0, totalCents + deliveryFeeCents - discountCents),
          deliveryFeeCents,
          discountCents,
          couponId,
          couponCode,
          items: { create: itemsData },
        },
        include: { items: true },
      });
    } catch (err) {
      if (couponId) {
        await this.coupons.releaseCoupon(couponId).catch(() => undefined);
      }
      throw err;
    }

    if (this.printConfig.isEnabled()) {
      this.realtime.emitPrintCashier(order);
      this.realtime.emitPrintKitchen(order);
    }

    // Baixa o estoque (nunca lança — falha só é registrada no log).
    await this.stock.consumeForOrder(order);

    // Auto-salva o cliente quando o pedido vem da plataforma pública.
    // Condição: telefone presente e nenhum customerId já vinculado.
    if (!customerId && customerPhone) {
      await this.autoSaveCustomer(order.id, { ...dto, customerPhone }).catch((e) =>
        this.logger.warn(`Auto-save de cliente falhou: ${e?.message}`),
      );
    }

    this.realtime.emitOrderCreated(order);
    return order;
  }

  /** Cria ou encontra o cliente pelo telefone e salva o endereço do pedido. */
  private async autoSaveCustomer(orderId: string, dto: CreateOrderDto) {
    const customer = await this.prisma.customer.upsert({
      where: { phone: dto.customerPhone! },
      create: { name: dto.customerName, phone: dto.customerPhone },
      // Não sobrescreve dados de clientes já cadastrados manualmente.
      update: {},
    });

    await this.prisma.order.update({
      where: { id: orderId },
      data: { customerId: customer.id },
    });

    const street = dto.addressStreet;
    if (street && street !== 'Balcão') {
      const already = await this.prisma.customerAddress.findFirst({
        where: { customerId: customer.id, street },
      });
      if (!already) {
        const isFirst =
          (await this.prisma.customerAddress.count({
            where: { customerId: customer.id },
          })) === 0;
        await this.prisma.customerAddress.create({
          data: {
            customerId: customer.id,
            street,
            number: dto.addressNumber,
            neighborhood: dto.addressNeighborhood,
            lat: dto.addressLat,
            lng: dto.addressLng,
            isDefault: isFirst,
          },
        });
      }
    }

    this.logger.log(`Cliente auto-salvo: ${customer.id} (${dto.customerPhone})`);
  }

  /** Visão da cozinha: pedidos ativos de hoje, sem dados pessoais do cliente. */
  listForKitchen() {
    const { start, end } = dayRange(localDay(new Date()));
    return this.prisma.order.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        status: { in: ['RECEIVED', 'IN_PREPARATION', 'READY'] },
      },
      orderBy: { dailyNumber: 'asc' },
      select: {
        id: true,
        dailyNumber: true,
        channel: true,
        status: true,
        notes: true,
        createdAt: true,
        customerName: true,
        items: {
          select: {
            id: true,
            nameSnapshot: true,
            optionNameSnapshot: true,
            quantity: true,
            notes: true,
          },
        },
      },
    });
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
      include: { items: true, courier: { select: { id: true, name: true } } },
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
    const prev = await this.prisma.order.findUnique({
      where: { id },
      select: { status: true, couponId: true },
    });
    if (!prev) throw new NotFoundException('Pedido não encontrado');

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
      if (prev.status !== OrderStatus.CANCELED && prev.couponId) {
        await this.coupons.releaseCoupon(prev.couponId);
      }
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
        if (
          deliveryFeeCents === undefined &&
          existing.channel === OrderChannel.OWN
        ) {
          deliveryFeeCents = n.customerFeeCents;
        }
      }
    } else if (dto.neighborhoodId === null && dto.courierId === null) {
      if (courierFeeCents === undefined) courierFeeCents = 0;
      if (
        deliveryFeeCents === undefined &&
        existing.channel === OrderChannel.OWN
      ) {
        deliveryFeeCents = 0;
      }
    } else if (dto.courierId === null && courierFeeCents === undefined) {
      courierFeeCents = 0;
    }

    const nextTotalCents =
      deliveryFeeCents !== undefined
        ? Math.max(
            0,
            existing.totalCents - existing.deliveryFeeCents + deliveryFeeCents,
          )
        : undefined;

    const order = await this.prisma.order.update({
      where: { id },
      data: {
        ...(dto.courierId !== undefined ? { courierId: dto.courierId } : {}),
        ...(dto.neighborhoodId !== undefined
          ? { neighborhoodId: dto.neighborhoodId }
          : {}),
        ...(courierFeeCents !== undefined ? { courierFeeCents } : {}),
        ...(deliveryFeeCents !== undefined ? { deliveryFeeCents } : {}),
        ...(nextTotalCents !== undefined ? { totalCents: nextTotalCents } : {}),
      },
      include: { items: true },
    });
    this.realtime.emitOrderStatusChanged(order);
    return order;
  }

  /** Pedidos atribuídos ao entregador autenticado. Sem datas = dia atual. */
  listForCourier(courierId: string, from?: string, to?: string) {
    const createdAt =
      from || to
        ? periodFilter(from, to)
        : (() => {
            const { start, end } = dayRange(localDay(new Date()));
            return { gte: start, lt: end };
          })();
    return this.prisma.order.findMany({
      where: {
        courierId,
        createdAt,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        protocol: true,
        dailyNumber: true,
        status: true,
        customerName: true,
        customerPhone: true,
        addressStreet: true,
        addressNumber: true,
        addressComplement: true,
        addressNeighborhood: true,
        addressReference: true,
        courierFeeCents: true,
        notes: true,
        createdAt: true,
        channel: true,
        externalId: true,
        neighborhood: { select: { name: true } },
        items: {
          select: {
            id: true,
            nameSnapshot: true,
            optionNameSnapshot: true,
            quantity: true,
            notes: true,
          },
        },
      },
    });
  }

  /** Entregador atualiza o status do seu próprio pedido (só OUT_FOR_DELIVERY ou DELIVERED). */
  async updateCourierStatus(
    orderId: string,
    courierId: string,
    status: 'OUT_FOR_DELIVERY' | 'DELIVERED',
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.courierId !== courierId) {
      throw new NotFoundException('Pedido não encontrado');
    }
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status },
      include: { items: true },
    });
    this.realtime.emitOrderStatusChanged(updated);
    return updated;
  }

  /** Entregador confirma entrega na plataforma (iFood/99Food) + marca DELIVERED. */
  async confirmOnPlatform(
    orderId: string,
    courierId: string,
    customerCode: string,
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.courierId !== courierId) {
      throw new NotFoundException('Pedido não encontrado');
    }
    if (!order.externalId) {
      throw new BadRequestException('Este pedido não possui localizador de plataforma');
    }
    if (order.channel !== 'IFOOD' && order.channel !== 'NOVENTA_NOVE') {
      throw new BadRequestException('Confirmação de plataforma disponível apenas para iFood e 99Food');
    }

    await this.confirmPlatform.confirm(
      order.channel as 'IFOOD' | 'NOVENTA_NOVE',
      order.externalId,
      customerCode,
    );

    // Confirmação ok na plataforma → marca DELIVERED no nosso sistema
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.DELIVERED },
      include: { items: true },
    });
    this.realtime.emitOrderStatusChanged(updated);
    return updated;
  }

  /** Reimpressão manual — target controla qual impressora. */
  async reprint(id: string, target: 'cashier' | 'kitchen' | 'both' = 'both') {
    const order = await this.findOne(id);
    if (this.printConfig.isEnabled()) {
      if (target !== 'kitchen') this.realtime.emitPrintCashier(order);
      if (target !== 'cashier') this.realtime.emitPrintKitchen(order);
    }
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
    if (order.status !== OrderStatus.CANCELED && order.couponId) {
      await this.coupons.releaseCoupon(order.couponId);
    }
    await this.prisma.order.delete({ where: { id: order.id } });
    return { deleted: true, protocol: order.protocol };
  }
}
