import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

export class UpdateCartItemDto {
  @ApiProperty({
    example: 3,
    minimum: 0.001,
    description: 'Nueva cantidad (máx. 3 decimales)',
  })
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'quantity debe ser un número con hasta 3 decimales' },
  )
  @Min(0.001, { message: 'quantity debe ser mayor que 0' })
  @Max(99_999_999, { message: 'quantity es demasiado alto' })
  quantity: number;
}
