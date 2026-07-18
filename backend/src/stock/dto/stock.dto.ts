import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

// As quantidades chegam em PORÇÕES (aceitam meia: 0.5, 1.5...); o service
// converte para meias porções (inteiro) antes de gravar.

export class CreateStockItemDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  portions?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  alertPortions?: number;
}

export class UpdateStockItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  alertPortions?: number;

  // Define o saldo absoluto (contagem/inventário).
  @IsOptional()
  @IsNumber()
  @Min(0)
  setPortions?: number;

  // Ajuste relativo: positivo repõe, negativo baixa.
  @IsOptional()
  @IsNumber()
  deltaPortions?: number;
}
