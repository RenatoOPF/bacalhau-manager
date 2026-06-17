import { IsEnum, IsOptional } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class PayOrderDto {
  // Opcional: permite corrigir a forma de pagamento no momento do recebimento
  // (ex: cliente escolheu PIX mas pagou em dinheiro).
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}
