import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
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

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items: OrderItemInputDto[];
}
