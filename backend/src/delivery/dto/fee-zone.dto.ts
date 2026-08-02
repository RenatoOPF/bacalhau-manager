import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateFeeZoneDto {
  @IsString()
  @MinLength(1)
  label: string;

  @IsNumber()
  @Min(0)
  maxKm: number;

  @IsInt()
  @Min(0)
  feeCents: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  courierFeeCents?: number;
}

export class UpdateFeeZoneDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxKm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  feeCents?: number;

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
