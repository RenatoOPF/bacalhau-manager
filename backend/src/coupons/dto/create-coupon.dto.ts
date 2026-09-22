import { CouponType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCouponDto {
  @IsString()
  @MinLength(3)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'Código deve ser maiúsculo, sem espaços ou acentos' })
  code: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(CouponType)
  type: CouponType;

  @IsInt()
  @Min(1)
  @Max(100_000_00)
  value: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minOrderCents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
