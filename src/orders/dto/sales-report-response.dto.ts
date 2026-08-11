import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '../payment.entity';

export class SalesReportRangeDto {
  @ApiProperty({
    type: 'string',
    nullable: true,
    description: 'Fecha inicial del rango (null = sin límite)',
  })
  from: string | null;

  @ApiProperty({
    type: 'string',
    nullable: true,
    description: 'Fecha final del rango (null = sin límite)',
  })
  to: string | null;
}

export class SalesReportSummaryDto {
  @ApiProperty({ example: 42 })
  totalOrders: number;

  @ApiProperty({ example: 385.2 })
  totalAmount: number;

  @ApiProperty({ example: 9.17 })
  averageTicket: number;
}

export class SalesByDayDto {
  @ApiProperty({ example: '2026-08-08' })
  date: string;

  @ApiProperty({ example: 12 })
  orders: number;

  @ApiProperty({ example: 110.4 })
  amount: number;
}

export class SalesTopProductDto {
  @ApiProperty({ type: 'string', format: 'uuid', nullable: true })
  productId: string | null;

  @ApiProperty({ example: 'Manzana Roja' })
  productName: string;

  @ApiProperty({ example: 28 })
  quantity: number;

  @ApiProperty({ example: 55.7 })
  amount: number;
}

export class SalesByPaymentMethodDto {
  @ApiProperty({ enum: PaymentMethod })
  method: PaymentMethod;

  @ApiProperty({ example: 30 })
  orders: number;

  @ApiProperty({ example: 280.1 })
  amount: number;
}

export class SalesPaymentInstructionDto {
  @ApiProperty({ enum: PaymentMethod, description: 'Método de pago' })
  method: PaymentMethod;

  @ApiProperty({
    type: 'string',
    nullable: true,
    description:
      'Número de la billetera del comercio para que el cliente pague (null si no está configurado o el método no usa billetera)',
    example: '3001234567',
  })
  walletNumber: string | null;
}

export class SalesReportResponseDto {
  @ApiProperty({ type: () => SalesReportRangeDto })
  range: SalesReportRangeDto;

  @ApiProperty({ type: () => SalesReportSummaryDto })
  summary: SalesReportSummaryDto;

  @ApiProperty({
    type: () => [SalesByDayDto],
    description: 'Ventas agrupadas por día (más reciente primero)',
  })
  byDay: SalesByDayDto[];

  @ApiProperty({
    type: () => [SalesTopProductDto],
    description: 'Productos más vendidos por monto (top N)',
  })
  topProducts: SalesTopProductDto[];

  @ApiProperty({
    type: () => [SalesByPaymentMethodDto],
    description: 'Desglose por método de pago',
  })
  byPaymentMethod: SalesByPaymentMethodDto[];

  @ApiProperty({
    type: () => [SalesPaymentInstructionDto],
    description:
      'Datos para que los clientes paguen, por método (se incluyen en el CSV para poder imprimirlo/compartirlo)',
  })
  paymentInstructions: SalesPaymentInstructionDto[];
}
