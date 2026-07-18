import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class MoveDto {
  @IsIn(['up', 'down'])
  direction: 'up' | 'down';
}

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateMenuItemDto {
  @IsString()
  categoryId: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(0)
  priceCents: number;
}

export class UpdateMenuItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  // Insumo consumido pelo prato (null desvincula do estoque).
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  stockItemId?: string | null;

  // Consumo em meias porções por unidade, para itens SEM opções
  // (2 = 1 porção; executivos = 1).
  @IsOptional()
  @IsInt()
  @Min(1)
  stockHalfUnits?: number;
}

export class CreateOptionDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsInt()
  @Min(0)
  priceCents: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateOptionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  // Insumo da opção (proteína por opção, ex.: Tilápia/Salmão). Null desvincula.
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  stockItemId?: string | null;
}
