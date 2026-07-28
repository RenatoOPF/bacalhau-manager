import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertRecipeSheetDto } from './dto/recipe.dto';

const ingredientsOrder = { orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] };
const menuItemInclude = {
  include: { category: { select: { name: true } }, options: { orderBy: [{ sortOrder: 'asc' as const }] } },
};

@Injectable()
export class RecipeService {
  constructor(private readonly prisma: PrismaService) {}

  listAll() {
    return this.prisma.recipeSheet.findMany({
      include: {
        menuItem: menuItemInclude,
        ingredients: ingredientsOrder,
      },
      orderBy: { menuItem: { name: 'asc' } },
    });
  }

  getByMenuItem(menuItemId: string) {
    return this.prisma.recipeSheet.findUnique({
      where: { menuItemId },
      include: {
        menuItem: menuItemInclude,
        ingredients: ingredientsOrder,
      },
    });
  }

  async upsert(menuItemId: string, dto: UpsertRecipeSheetDto) {
    const { ingredients, ...sheetData } = dto;
    return this.prisma.$transaction(async (tx) => {
      const sheet = await tx.recipeSheet.upsert({
        where: { menuItemId },
        create: { menuItemId, ...sheetData },
        update: sheetData,
      });
      await tx.recipeIngredient.deleteMany({ where: { recipeId: sheet.id } });
      if (ingredients?.length) {
        await tx.recipeIngredient.createMany({
          data: ingredients.map((ing, i) => ({
            recipeId: sheet.id,
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            notes: ing.notes,
            sortOrder: ing.sortOrder ?? i,
          })),
        });
      }
      return tx.recipeSheet.findUnique({
        where: { id: sheet.id },
        include: { menuItem: menuItemInclude, ingredients: ingredientsOrder },
      });
    });
  }

  delete(menuItemId: string) {
    return this.prisma.recipeSheet.delete({ where: { menuItemId } });
  }
}
