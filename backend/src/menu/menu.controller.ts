import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { Role } from '@prisma/client';
import { MenuService } from './menu.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateMenuItemDto,
  UpdateMenuItemDto,
  CreateOptionDto,
  UpdateOptionDto,
  ReorderOptionsDto,
  MoveDto,
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

  @Post('items/:id/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = path.join(
            process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads'),
            'menu',
          );
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
          cb(null, `${(req as unknown as { params: { id: string } }).params.id}${ext}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (/^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Apenas JPEG, PNG ou WebP'), false);
        }
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    const imageUrl = `/uploads/menu/${file.filename}`;
    return this.menu.updateItem(id, { imageUrl });
  }

  @Delete('items/:id/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  deleteImage(@Param('id') id: string) {
    return this.menu.deleteItemImage(id);
  }

  @Patch('categories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.menu.updateCategory(id, dto);
  }

  @Post('categories/:id/move')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  moveCategory(@Param('id') id: string, @Body() dto: MoveDto) {
    return this.menu.moveCategory(id, dto.direction);
  }

  @Post('items/:id/move')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  moveItem(@Param('id') id: string, @Body() dto: MoveDto) {
    return this.menu.moveItem(id, dto.direction);
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

  @Post('items/:itemId/options/reorder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  reorderOptions(
    @Param('itemId') itemId: string,
    @Body() dto: ReorderOptionsDto,
  ) {
    return this.menu.reorderOptions(itemId, dto.orderedIds);
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
