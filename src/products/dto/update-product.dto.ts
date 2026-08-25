import { ApiPropertyOptional } from '@nestjs/swagger';
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

export class UpdateProductDto {
  @ApiPropertyOptional({
    description: 'Enviar null para quitar la categoría',
    example: '8b1a2d5e-1111-1111-1111-111111111111',
    nullable: true,
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'categoryId debe ser un UUID válido' })
  categoryId?: string;

  @ApiPropertyOptional({ example: 'MANZ-002', maxLength: 50 })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  sku?: string;

  @ApiPropertyOptional({ example: 'Manzana Golden', maxLength: 200 })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @ApiPropertyOptional({
    example: 'manzana-golden',
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
  })
  @IsOptional()
  @IsString()
  // eslint-disable-next-line security/detect-unsafe-regex
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'El slug solo puede contener minúsculas, números y guiones',
  })
  slug?: string;

  @ApiPropertyOptional({
    description: 'Enviar null para limpiar',
    example: 'Nueva descripción',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 3.2, minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999)
  price?: number;

  @ApiPropertyOptional({
    description: 'Debe ser menor que price · enviar null para limpiar',
    example: 2.5,
    nullable: true,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999)
  salePrice?: number;

  @ApiPropertyOptional({ example: 'kg', maxLength: 20 })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  unit?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isPerishable?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isOrganic?: boolean;

  @ApiPropertyOptional({
    description: 'Enviar null para limpiar',
    example: 'https://cdn.example.com/manzana.jpg',
    nullable: true,
  })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
