import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { OrderStatus } from '../order.entity';

export class UpdateOrderStatusDto {
  @ApiProperty({
    enum: OrderStatus,
    description: 'Nuevo estado del pedido',
    example: OrderStatus.PREPARING,
  })
  @IsEnum(OrderStatus, { message: 'status no es válido' })
  status: OrderStatus;
}
