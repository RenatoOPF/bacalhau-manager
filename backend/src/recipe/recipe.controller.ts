import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RecipeService } from './recipe.service';
import { UpsertRecipeSheetDto } from './dto/recipe.dto';

@Controller('recipe-sheets')
@UseGuards(JwtAuthGuard)
export class RecipeController {
  constructor(private readonly service: RecipeService) {}

  @Get()
  listAll() {
    return this.service.listAll();
  }

  @Get(':menuItemId')
  getOne(@Param('menuItemId') menuItemId: string) {
    return this.service.getByMenuItem(menuItemId);
  }

  @Put(':menuItemId')
  upsert(
    @Param('menuItemId') menuItemId: string,
    @Body() dto: UpsertRecipeSheetDto,
  ) {
    return this.service.upsert(menuItemId, dto);
  }

  @Delete(':menuItemId')
  @HttpCode(204)
  delete(@Param('menuItemId') menuItemId: string) {
    return this.service.delete(menuItemId);
  }
}
