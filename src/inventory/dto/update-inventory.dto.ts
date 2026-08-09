import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateInventoryDto {
  @ApiPropertyOptional({
    description: 'Cantidad exacta en stock (valor absoluto)',
    example: 50,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'stockQuantity debe ser un número con hasta 3 decimales' },
  )
  @Min(0, { message: 'stockQuantity no puede ser negativo' })
  @Max(99_999_999, { message: 'stockQuantity es demasiado alto' })
  stockQuantity?: number;

  @ApiPropertyOptional({
    description: 'Nivel mínimo que dispara LOW_STOCK',
    example: 5,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'minStockLevel debe ser un número con hasta 3 decimales' },
  )
  @Min(0, { message: 'minStockLevel no puede ser negativo' })
  @Max(99_999_999, { message: 'minStockLevel es demasiado alto' })
  minStockLevel?: number;

  @ApiPropertyOptional({
    description: 'Fecha de vencimiento (enviar null para limpiar)',
    example: '2026-08-20',
    nullable: true,
  })
  @IsOptional()
  @IsDateString(
    {},
    { message: 'expirationDate debe ser una fecha válida (YYYY-MM-DD)' },
  )
  expirationDate?: string | null;
}
