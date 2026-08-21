import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class OrderItemInputDto {
  @IsString()
  menuItemId: string;

  // Obrigatório quando o item tem opções (ex.: Individual/Inteira).
  @IsOptional()
  @IsString()
  optionId?: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateOrderDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsString()
  @MinLength(1)
  customerName: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  addressStreet?: string;

  @IsOptional()
  @IsString()
  addressNumber?: string;

  @IsOptional()
  @IsString()
  addressComplement?: string;

  @IsOptional()
  @IsString()
  addressNeighborhood?: string;

  @IsOptional()
  @IsString()
  addressReference?: string;

  // Coordenadas geocodificadas (Nominatim) — preferidas para cálculo de taxa por km.
  @IsOptional()
  @IsNumber()
  addressLat?: number;

  @IsOptional()
  @IsNumber()
  addressLng?: number;

  // Bairro de entrega (legado / fallback se não houver coordenadas).
  @IsOptional()
  @IsString()
  neighborhoodId?: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_00) // max R$ 100.000
  discountCents?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items: OrderItemInputDto[];
}
