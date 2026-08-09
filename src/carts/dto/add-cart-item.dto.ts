import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsUUID, Max, Min } from 'class-validator';

export class AddCartItemDto {
  @ApiProperty({ example: '8b1a2d5e-1111-1111-1111-111111111111' })
  @IsUUID(undefined, { message: 'productId debe ser un UUID válido' })
  productId: string;

  @ApiProperty({
    example: 2,
    minimum: 0.001,
    description: 'Cantidad (máx. 3 decimales)',
  })
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'quantity debe ser un número con hasta 3 decimales' },
  )
  @Min(0.001, { message: 'quantity debe ser mayor que 0' })
  @Max(99_999_999, { message: 'quantity es demasiado alto' })
  quantity: number;
}
