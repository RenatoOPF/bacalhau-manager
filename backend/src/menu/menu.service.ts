import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as path from 'path';
import * as fs from 'fs';
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

  private publicMenuCache: unknown = null;
  private publicMenuCacheExpires = 0;
  private readonly PUBLIC_MENU_TTL = 30_000; // 30 segundos

  private invalidatePublicMenu() {
    this.publicMenuCache = null;
    this.publicMenuCacheExpires = 0;
  }

  /** Cardápio público: categorias ativas, itens disponíveis e opções disponíveis. */
  async getPublicMenu() {
    if (this.publicMenuCache && Date.now() < this.publicMenuCacheExpires) {
      return this.publicMenuCache;
    }
    const data = await this.prisma.menuCategory.findMany({
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
    this.publicMenuCache = data;
    this.publicMenuCacheExpires = Date.now() + this.PUBLIC_MENU_TTL;
    return data;
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

  async createCategory(dto: CreateCategoryDto) {
    const result = await this.prisma.menuCategory.create({ data: dto });
    this.invalidatePublicMenu();
    return result;
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
    this.invalidatePublicMenu();
    return { moved: true };
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const result = await this.prisma.menuCategory.update({ where: { id }, data: dto });
    this.invalidatePublicMenu();
    return result;
  }

  async createItem(dto: CreateMenuItemDto) {
    const result = await this.prisma.menuItem.create({ data: dto });
    this.invalidatePublicMenu();
    return result;
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
    this.invalidatePublicMenu();
    return { moved: true };
  }

  async updateItem(id: string, dto: UpdateMenuItemDto) {
    const result = await this.prisma.menuItem.update({ where: { id }, data: dto });
    this.invalidatePublicMenu();
    return result;
  }

  /**
   * Exclui um item (opções em cascata). Pedidos antigos que o referenciavam
   * mantêm os snapshots (nome/preço/opção) e apenas perdem o vínculo (SetNull).
   */
  async deleteItem(id: string) {
    await this.prisma.menuItem.delete({ where: { id } });
    this.invalidatePublicMenu();
    return { id };
  }

  async deleteItemImage(id: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id },
      select: { imageUrl: true },
    });
    if (item?.imageUrl) {
      const uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads');
      const filePath = path.join(uploadDir, item.imageUrl.replace('/uploads/', ''));
      fs.rmSync(filePath, { force: true });
    }
    await this.prisma.menuItem.update({ where: { id }, data: { imageUrl: null } });
    this.invalidatePublicMenu();
    return { id };
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
    await this.prisma.menuCategory.delete({ where: { id } });
    this.invalidatePublicMenu();
    return { id };
  }

  // ---- Opções (variações) do item ----

  async createOption(menuItemId: string, dto: CreateOptionDto) {
    const result = await this.prisma.menuItemOption.create({
      data: { menuItemId, ...dto },
    });
    this.invalidatePublicMenu();
    return result;
  }

  async updateOption(id: string, dto: UpdateOptionDto) {
    const result = await this.prisma.menuItemOption.update({ where: { id }, data: dto });
    this.invalidatePublicMenu();
    return result;
  }

  async deleteOption(id: string) {
    await this.prisma.menuItemOption.delete({ where: { id } });
    this.invalidatePublicMenu();
    return { id };
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
    this.invalidatePublicMenu();
    return { reordered: true };
  }
}
