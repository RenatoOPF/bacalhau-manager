import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateNeighborhoodDto {
  @IsString()
  @MinLength(1)
  name: string;

  // Taxa cobrada do cliente, em centavos.
  @IsOptional()
  @IsInt()
  @Min(0)
  customerFeeCents?: number;

  // Repasse ao entregador, em centavos.
  @IsOptional()
  @IsInt()
  @Min(0)
  courierFeeCents?: number;
}

export class UpdateNeighborhoodDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  customerFeeCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  courierFeeCents?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
