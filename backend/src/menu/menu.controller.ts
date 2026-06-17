import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { MenuService } from './menu.service';
import {
  CreateCategoryDto,
  CreateMenuItemDto,
  UpdateMenuItemDto,
} from './dto/menu.dto';

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
  getFullMenu() {
    return this.menu.getFullMenu();
  }

  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.menu.createCategory(dto);
  }

  @Post('items')
  createItem(@Body() dto: CreateMenuItemDto) {
    return this.menu.createItem(dto);
  }

  @Patch('items/:id')
  updateItem(@Param('id') id: string, @Body() dto: UpdateMenuItemDto) {
    return this.menu.updateItem(id, dto);
  }
}
