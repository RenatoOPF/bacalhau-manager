import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { ExpenseCategory } from '@prisma/client';

export class CreateExpenseDto {
  @IsString()
  @MinLength(1)
  description: string;

  @IsEnum(ExpenseCategory)
  category: ExpenseCategory;

  // Valor em centavos.
  @IsInt()
  @Min(0)
  amountCents: number;

  // Competência (YYYY-MM-DD ou ISO). Entra no DRE do período.
  @IsISO8601()
  dueDate: string;

  // Data de pagamento (ISO). Ausente = conta a pagar em aberto.
  @IsOptional()
  @IsISO8601()
  paidAt?: string;

  @IsOptional()
  @IsBoolean()
  recurring?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateExpenseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @IsOptional()
  @IsInt()
  @Min(0)
  amountCents?: number;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  // null explícito remove o pagamento (volta a ser conta a pagar).
  @IsOptional()
  @IsISO8601()
  paidAt?: string | null;

  @IsOptional()
  @IsBoolean()
  recurring?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
