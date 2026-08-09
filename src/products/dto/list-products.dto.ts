import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class ListProductsDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    example: '8b1a2d5e-1111-1111-1111-111111111111',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'categoryId debe ser un UUID válido' })
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por activos: "true" o "false"',
    example: 'true',
  })
  @IsOptional()
  @IsBooleanString({ message: 'active debe ser "true" o "false"' })
  active?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por disponibilidad: "true" o "false"',
    example: 'true',
  })
  @IsOptional()
  @IsBooleanString({ message: 'inStock debe ser "true" o "false"' })
  inStock?: string;

  @ApiPropertyOptional({
    description: 'Búsqueda por nombre o SKU (case-insensitive)',
    example: 'manzana',
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  search?: string;
}
