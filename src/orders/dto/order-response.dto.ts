import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '../order.entity';
import { PaymentMethod, PaymentStatus } from '../payment.entity';

export class OrderItemDto {
  @ApiProperty({
    type: 'string',
    format: 'uuid',
    nullable: true,
    description: 'Id del producto (null si fue eliminado del catálogo)',
  })
  productId: string | null;

  @ApiProperty({ description: 'Nombre del producto (snapshot de la compra)' })
  productName: string;

  @ApiProperty({
    example: 1.99,
    description: 'Precio unitario en el momento de la compra',
  })
  unitPrice: number;

  @ApiProperty({ example: 2, description: 'Cantidad comprada' })
  quantity: number;

  @ApiProperty({
    example: 3.98,
    description: 'Subtotal del item (unitPrice × quantity)',
  })
  subtotal: number;
}

export class OrderUserDto {
  @ApiProperty({ type: 'string', format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;
}

export class OrderShippingAddressDto {
  @ApiProperty()
  addressLine1: string;

  @ApiProperty({ type: 'string', nullable: true })
  addressLine2: string | null;

  @ApiProperty()
  city: string;

  @ApiProperty({ type: 'string', nullable: true })
  stateProvince: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  postalCode: string | null;

  @ApiProperty({ type: 'string', nullable: true })
  deliveryNotes: string | null;
}

export class OrderPaymentDto {
  @ApiProperty({ type: 'string', format: 'uuid' })
  id: string;

  @ApiProperty({
    enum: PaymentMethod,
    description: 'Método de pago del pedido',
  })
  method: PaymentMethod;

  @ApiProperty({ enum: PaymentStatus, description: 'Estado del pago' })
  status: PaymentStatus;

  @ApiProperty({
    type: 'string',
    nullable: true,
    description: 'Id de la transacción (null si está pendiente)',
  })
  transactionId: string | null;

  @ApiProperty({ example: 3.98 })
  amount: number;

  @ApiProperty({
    type: 'string',
    nullable: true,
    description:
      'Número de la billetera del comercio (NEQUI/DAVIPLATA) para que el cliente pague. null si no está configurado o el método no usa billetera.',
    example: '3001234567',
  })
  walletNumber: string | null;
}

export class OrderResponseDto {
  @ApiProperty({ type: 'string', format: 'uuid' })
  id: string;

  @ApiProperty({ example: 42, description: 'Número consecutivo del pedido' })
  orderNumber: number;

  @ApiProperty({ type: 'string', format: 'uuid' })
  userId: string;

  @ApiProperty({ type: () => OrderUserDto, nullable: true })
  user: OrderUserDto | null;

  @ApiProperty({
    type: () => OrderUserDto,
    nullable: true,
    description: 'Repartidor que confirmó la entrega',
  })
  deliveredBy: OrderUserDto | null;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty({ example: 3.98 })
  subtotal: number;

  @ApiProperty({ example: 0 })
  deliveryFee: number;

  @ApiProperty({ example: 3.98 })
  total: number;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  deliverySlotStart: string | null;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  deliverySlotEnd: string | null;

  @ApiProperty({ type: () => OrderShippingAddressDto, nullable: true })
  shippingAddress: OrderShippingAddressDto | null;

  @ApiProperty({ type: () => [OrderItemDto] })
  items: OrderItemDto[];

  @ApiProperty({ type: () => OrderPaymentDto, nullable: true })
  payment: OrderPaymentDto | null;

  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt: string;
}

export class PaginatedOrderResponseDto {
  @ApiProperty({ type: () => [OrderResponseDto] })
  data: OrderResponseDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class DeliveriesSummaryDto {
  @ApiProperty({ example: 10 })
  totalDelivered: number;

  @ApiProperty({ example: 154.5 })
  totalAmount: number;

  @ApiProperty({ example: 3 })
  todayDelivered: number;

  @ApiProperty({ example: 45.2 })
  todayAmount: number;
}

export class DeliveriesReportDto extends PaginatedOrderResponseDto {
  @ApiProperty({ type: () => DeliveriesSummaryDto })
  summary: DeliveriesSummaryDto;
}
