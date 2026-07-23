import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateExpenseDto {
  @IsString()
  @MinLength(1)
  description: string;

  // Categoria (id da tabela ExpenseCategory). Opcional = sem categoria.
  @IsOptional()
  @IsString()
  categoryId?: string;

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
  @IsString()
  accountId?: string;

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

  // null explícito desvincula a categoria.
  @IsOptional()
  @IsString()
  categoryId?: string | null;

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

  // null explícito desvincula a conta.
  @IsOptional()
  @IsString()
  accountId?: string | null;

  @IsOptional()
  @IsBoolean()
  recurring?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateExpenseCategoryDto {
  @IsString()
  @MinLength(1)
  name: string;
}

export class UpdateExpenseCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
