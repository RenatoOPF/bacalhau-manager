import { IsEnum, IsIn, IsString, MinLength } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class UpdateStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;
}

export class UpdateCourierStatusDto {
  @IsIn([OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED])
  status: 'OUT_FOR_DELIVERY' | 'DELIVERED';
}

export class ConfirmPlatformDto {
  @IsString()
  @MinLength(1)
  customerCode: string;
}
