import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class ListCategoriesDto {
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
    description: 'Filtrar por categoría padre (omite para ver todas)',
    example: '8b1a2d5e-1111-1111-1111-111111111111',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'parentId debe ser un UUID válido' })
  parentId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por activas: "true" o "false"',
    example: 'true',
  })
  @IsOptional()
  @IsBooleanString({ message: 'active debe ser "true" o "false"' })
  active?: string;
}
