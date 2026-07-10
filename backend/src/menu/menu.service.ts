import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCategoryDto,
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
          orderBy: { name: 'asc' },
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

  /** Cardápio completo para o admin (inclui itens/opções indisponíveis). */
  getFullMenu() {
    return this.prisma.menuCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          orderBy: { name: 'asc' },
          include: {
            options: { orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }] },
          },
        },
      },
    });
  }

  createCategory(dto: CreateCategoryDto) {
    return this.prisma.menuCategory.create({ data: dto });
  }

  createItem(dto: CreateMenuItemDto) {
    return this.prisma.menuItem.create({ data: dto });
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
}
