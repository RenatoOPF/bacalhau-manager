import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateMenuItemDto,
  UpdateMenuItemDto,
  CreateOptionDto,
  UpdateOptionDto,
} from './dto/menu.dto';

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cardápio público: categorias ativas, itens disponíveis e opções disponíveis. */
  getPublicMenu() {
    return this.prisma.menuCategory.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          where: { available: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            options: {
              where: { available: true },
              orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }],
            },
          },
        },
      },
    });
  }

  /** Cardápio completo para o admin (inclui itens/opções indisponíveis e os
   *  vínculos de estoque de itens e opções). */
  getFullMenu() {
    return this.prisma.menuCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            options: {
              orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }],
              include: { stockLinks: true },
            },
            stockLinks: true,
          },
        },
      },
    });
  }

  createCategory(dto: CreateCategoryDto) {
    return this.prisma.menuCategory.create({ data: dto });
  }

  /**
   * Move uma categoria uma posição para cima/baixo. Reatribui o sortOrder de
   * todas em sequência (0,1,2...) para garantir uma ordem consistente mesmo
   * que os valores atuais estejam repetidos.
   */
  async moveCategory(id: string, direction: 'up' | 'down') {
    const cats = await this.prisma.menuCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const idx = cats.findIndex((c) => c.id === id);
    if (idx === -1) {
      throw new BadRequestException('Categoria não encontrada');
    }
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= cats.length) {
      return { moved: false }; // já está no topo/fim
    }
    [cats[idx], cats[swapIdx]] = [cats[swapIdx], cats[idx]];
    await this.prisma.$transaction(
      cats.map((c, i) =>
        this.prisma.menuCategory.update({
          where: { id: c.id },
          data: { sortOrder: i },
        }),
      ),
    );
    return { moved: true };
  }

  updateCategory(id: string, dto: UpdateCategoryDto) {
    return this.prisma.menuCategory.update({ where: { id }, data: dto });
  }

  createItem(dto: CreateMenuItemDto) {
    return this.prisma.menuItem.create({ data: dto });
  }

  /** Move um item uma posição para cima/baixo DENTRO da sua categoria. */
  async moveItem(id: string, direction: 'up' | 'down') {
    const item = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!item) throw new BadRequestException('Item não encontrado');
    const items = await this.prisma.menuItem.findMany({
      where: { categoryId: item.categoryId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const idx = items.findIndex((i) => i.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= items.length) {
      return { moved: false };
    }
    [items[idx], items[swapIdx]] = [items[swapIdx], items[idx]];
    await this.prisma.$transaction(
      items.map((it, i) =>
        this.prisma.menuItem.update({
          where: { id: it.id },
          data: { sortOrder: i },
        }),
      ),
    );
    return { moved: true };
  }

  updateItem(id: string, dto: UpdateMenuItemDto) {
    return this.prisma.menuItem.update({ where: { id }, data: dto });
  }

  /**
   * Exclui um item (opções em cascata). Pedidos antigos que o referenciavam
   * mantêm os snapshots (nome/preço/opção) e apenas perdem o vínculo (SetNull).
   */
  deleteItem(id: string) {
    return this.prisma.menuItem.delete({ where: { id } });
  }

  /** Exclui uma categoria vazia. Bloqueia se ainda tiver itens. */
  async deleteCategory(id: string) {
    const items = await this.prisma.menuItem.count({
      where: { categoryId: id },
    });
    if (items > 0) {
      throw new BadRequestException(
        'A categoria ainda tem itens. Exclua ou mova os itens antes.',
      );
    }
    return this.prisma.menuCategory.delete({ where: { id } });
  }

  // ---- Opções (variações) do item ----

  createOption(menuItemId: string, dto: CreateOptionDto) {
    return this.prisma.menuItemOption.create({
      data: { menuItemId, ...dto },
    });
  }

  updateOption(id: string, dto: UpdateOptionDto) {
    return this.prisma.menuItemOption.update({ where: { id }, data: dto });
  }

  deleteOption(id: string) {
    return this.prisma.menuItemOption.delete({ where: { id } });
  }

  /** Reordena as opções de um item a partir de uma lista ordenada de IDs. */
  async reorderOptions(menuItemId: string, orderedIds: string[]) {
    const options = await this.prisma.menuItemOption.findMany({
      where: { menuItemId },
      select: { id: true },
    });
    const idsInItem = new Set(options.map((o) => o.id));
    if (
      orderedIds.length !== idsInItem.size ||
      !orderedIds.every((id) => idsInItem.has(id))
    ) {
      throw new BadRequestException('Lista de IDs inválida para este item.');
    }
    await this.prisma.$transaction(
      orderedIds.map((id, i) =>
        this.prisma.menuItemOption.update({
          where: { id },
          data: { sortOrder: i },
        }),
      ),
    );
    return { reordered: true };
  }
}
