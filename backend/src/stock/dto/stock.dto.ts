import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

// As quantidades chegam na UNIDADE do insumo (porções/kg/un, aceitam fração:
// 0.5 porção, 1.2 kg); o service converte para milésimos antes de gravar.

export const STOCK_UNITS = ['porção', 'kg', 'un'] as const;

export class CreateStockItemDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsIn(STOCK_UNITS as unknown as string[])
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  qty?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  alertQty?: number;
}

export class UpdateStockItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsIn(STOCK_UNITS as unknown as string[])
  unit?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  alertQty?: number;

  // Define o saldo absoluto (contagem/inventário).
  @IsOptional()
  @IsNumber()
  @Min(0)
  setQty?: number;

  // Ajuste relativo: positivo repõe, negativo baixa.
  @IsOptional()
  @IsNumber()
  deltaQty?: number;

  // Substituto quando zerado (null = remover). Junto com o fator de conversão
  // (unidades do substituto por 1 desta: 0.5 para 200g→400g, 2 para 400g→200g).
  @IsOptional()
  @ValidateIf((o) => o.substituteId !== null)
  @IsString()
  substituteId?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  substituteFactor?: number;
}

/**
 * Produção manual (só para insumos com matéria-prima definida — bacalhau):
 * baixa `fromQty` da origem do insumo (ex.: kg de bacalhau) e credita
 * `toQty` no próprio insumo (porções preparadas).
 */
export class ProduceDto {
  @IsString()
  toId: string;

  @IsNumber()
  @IsPositive()
  fromQty: number;

  @IsNumber()
  @IsPositive()
  toQty: number;
}

/** Vínculo prato/opção → insumo (exatamente um de menuItemId/optionId). */
export class CreateStockLinkDto {
  @IsString()
  stockItemId: string;

  @IsOptional()
  @IsString()
  menuItemId?: string;

  @IsOptional()
  @IsString()
  optionId?: string;

  // Consumo por venda na unidade do insumo (em itens com opções de tamanho,
  // refere-se à Porção Inteira; a Meia desconta metade).
  @IsOptional()
  @IsNumber()
  @IsPositive()
  qty?: number;
}

export class UpdateStockLinkDto {
  @IsNumber()
  @IsPositive()
  qty: number;
}

export class MoveStockDto {
  @IsIn(['up', 'down'])
  direction: 'up' | 'down';
}
