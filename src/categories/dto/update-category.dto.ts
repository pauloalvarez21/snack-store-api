import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'Frutas Importadas', maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100, { message: 'El nombre debe tener entre 1 y 100 caracteres' })
  name?: string;

  @ApiPropertyOptional({
    example: 'frutas-importadas',
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
  })
  @IsOptional()
  @IsString()
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

  @ApiPropertyOptional({
    description: 'Enviar null para quitar la categoría padre',
    example: '8b1a2d5e-1111-1111-1111-111111111111',
    nullable: true,
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'parentId debe ser un UUID válido' })
  parentId?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
