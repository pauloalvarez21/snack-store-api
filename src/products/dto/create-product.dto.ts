import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @ApiPropertyOptional({
    description: 'Id de la categoría del producto',
    example: '8b1a2d5e-1111-1111-1111-111111111111',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'categoryId debe ser un UUID válido' })
  categoryId?: string;

  @ApiProperty({ example: 'MANZ-001', maxLength: 50 })
  @IsString()
  @Length(1, 50, { message: 'El SKU debe tener entre 1 y 50 caracteres' })
  sku: string;

  @ApiProperty({ example: 'Manzana Roja', maxLength: 200 })
  @IsString()
  @Length(1, 200, { message: 'El nombre debe tener entre 1 y 200 caracteres' })
  name: string;

  @ApiPropertyOptional({
    description: 'Si no se envía, se genera automáticamente desde el nombre',
    example: 'manzana-roja',
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
  })
  @IsOptional()
  @IsString()
  // eslint-disable-next-line security/detect-unsafe-regex
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'El slug solo puede contener minúsculas, números y guiones',
  })
  slug?: string;

  @ApiPropertyOptional({ example: 'Manzanas rojas de exportación' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 2.5, minimum: 0, maximum: 99999999 })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'price debe ser un número con hasta 2 decimales' },
  )
  @Min(0, { message: 'price no puede ser negativo' })
  @Max(99_999_999, { message: 'price es demasiado alto' })
  price: number;

  @ApiPropertyOptional({
    description: 'Debe ser menor que price',
    example: 1.99,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'salePrice debe ser un número con hasta 2 decimales' },
  )
  @Min(0, { message: 'salePrice no puede ser negativo' })
  @Max(99_999_999, { message: 'salePrice es demasiado alto' })
  salePrice?: number;

  @ApiProperty({
    description: 'Unidad de venta: kg, g, litro, unidad, pack…',
    example: 'kg',
    maxLength: 20,
  })
  @IsString()
  @Length(1, 20, { message: 'La unidad debe tener entre 1 y 20 caracteres' })
  unit: string;

  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional()
  @IsBoolean()
  isPerishable?: boolean;

  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional()
  @IsBoolean()
  isOrganic?: boolean;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/manzana.jpg',
  })
  @IsOptional()
  @IsUrl({}, { message: 'imageUrl debe ser una URL válida' })
  imageUrl?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
