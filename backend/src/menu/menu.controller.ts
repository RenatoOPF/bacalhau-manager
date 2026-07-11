import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { MenuService } from './menu.service';
import {
  CreateCategoryDto,
  CreateMenuItemDto,
  UpdateMenuItemDto,
  CreateOptionDto,
  UpdateOptionDto,
  MoveCategoryDto,
} from './dto/menu.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  /** Cardápio público consumido pelo cliente. */
  @Get()
  getPublicMenu() {
    return this.menu.getPublicMenu();
  }

  /** Cardápio completo para o painel admin. */
  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getFullMenu() {
    return this.menu.getFullMenu();
  }

  @Post('categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.menu.createCategory(dto);
  }

  @Post('items')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  createItem(@Body() dto: CreateMenuItemDto) {
    return this.menu.createItem(dto);
  }

  @Patch('items/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateItem(@Param('id') id: string, @Body() dto: UpdateMenuItemDto) {
    return this.menu.updateItem(id, dto);
  }

  @Delete('items/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  deleteItem(@Param('id') id: string) {
    return this.menu.deleteItem(id);
  }

  @Post('categories/:id/move')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  moveCategory(@Param('id') id: string, @Body() dto: MoveCategoryDto) {
    return this.menu.moveCategory(id, dto.direction);
  }

  @Delete('categories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  deleteCategory(@Param('id') id: string) {
    return this.menu.deleteCategory(id);
  }

  // ---- Opções (variações) do item ----

  @Post('items/:itemId/options')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  createOption(
    @Param('itemId') itemId: string,
    @Body() dto: CreateOptionDto,
  ) {
    return this.menu.createOption(itemId, dto);
  }

  @Patch('options/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateOption(@Param('id') id: string, @Body() dto: UpdateOptionDto) {
    return this.menu.updateOption(id, dto);
  }

  @Delete('options/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  deleteOption(@Param('id') id: string) {
    return this.menu.deleteOption(id);
  }
}
