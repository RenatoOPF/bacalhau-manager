import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ExpensesService } from './expenses.service';
import {
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  UpdateExpenseCategoryDto,
  UpdateExpenseDto,
} from './dto/expense.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  list(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: 'paid' | 'unpaid',
  ) {
    return this.expenses.list(from, to, categoryId, status);
  }

  @Get('by-account')
  byAccount(@Query('from') from?: string, @Query('to') to?: string) {
    return this.expenses.byAccount(from, to);
  }

  // ---- Categorias (declaradas antes das rotas :id) ----

  @Get('categories')
  listCategories() {
    return this.expenses.listCategories();
  }

  @Post('categories')
  createCategory(@Body() dto: CreateExpenseCategoryDto) {
    return this.expenses.createCategory(dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseCategoryDto,
  ) {
    return this.expenses.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  removeCategory(@Param('id') id: string) {
    return this.expenses.removeCategory(id);
  }

  // ---- Despesas ----

  @Post()
  create(@Body() dto: CreateExpenseDto) {
    return this.expenses.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.expenses.update(id, dto);
  }

  @Patch(':id/pay')
  pay(@Param('id') id: string) {
    return this.expenses.pay(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.expenses.remove(id);
  }
}
