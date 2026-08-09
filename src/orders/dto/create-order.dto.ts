import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { PaymentMethod } from '../payment.entity';

export class CreateOrderDto {
  @ApiPropertyOptional({
    example: '8b1a2d5e-1111-1111-1111-111111111111',
    description:
      'Dirección de envío guardada (id de /api/addresses). Si se envía, se guarda un snapshot inmutable en el pedido.',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'addressId debe ser un UUID válido' })
  addressId?: string;

  @ApiPropertyOptional({
    example: '2026-08-10T14:00:00.000Z',
    description: 'Inicio de la franja horaria de entrega (ISO 8601)',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'deliverySlotStart debe ser una fecha ISO 8601' })
  deliverySlotStart?: string;

  @ApiPropertyOptional({
    example: '2026-08-10T16:00:00.000Z',
    description: 'Fin de la franja horaria de entrega (ISO 8601)',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'deliverySlotEnd debe ser una fecha ISO 8601' })
  deliverySlotEnd?: string;

  @ApiProperty({
    enum: PaymentMethod,
    description: 'Método de pago del pedido',
    example: PaymentMethod.CREDIT_CARD,
  })
  @IsEnum(PaymentMethod, { message: 'paymentMethod no es válido' })
  paymentMethod: PaymentMethod;
}
