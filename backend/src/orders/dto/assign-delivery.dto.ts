import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class AssignDeliveryDto {
  // Entregador designado. null explícito remove a designação.
  @IsOptional()
  @IsString()
  courierId?: string | null;

  // Bairro (para puxar as taxas e para o relatório por bairro).
  @IsOptional()
  @IsString()
  neighborhoodId?: string | null;

  // Repasse ao entregador nesta entrega (centavos). Se omitido e houver bairro,
  // usa o courierFeeCents do bairro.
  @IsOptional()
  @IsInt()
  @Min(0)
  courierFeeCents?: number;

  // Taxa cobrada do cliente (centavos). Idem: cai para o bairro se omitida.
  @IsOptional()
  @IsInt()
  @Min(0)
  deliveryFeeCents?: number;
}
