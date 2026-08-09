import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

export class AdjustInventoryDto {
  @ApiProperty({
    description:
      'Cantidad a sumar (positiva) o restar (negativa). El total no puede quedar negativo.',
    example: 5,
  })
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'quantity debe ser un número con hasta 3 decimales' },
  )
  @Min(-99_999_999, { message: 'quantity es demasiado bajo' })
  @Max(99_999_999, { message: 'quantity es demasiado alto' })
  quantity: number;
}
