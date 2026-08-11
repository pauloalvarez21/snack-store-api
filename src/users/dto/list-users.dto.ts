import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { UserRole } from '../user.entity';

export class ListUsersDto {
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
    enum: UserRole,
    description: 'Filtrar por rol',
    example: UserRole.DELIVERY,
  })
  @IsOptional()
  @IsEnum(UserRole, { message: 'role no es válido' })
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'Buscar por email, nombre o apellido (case-insensitive)',
    example: 'juan',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, {
    message: 'La búsqueda no puede superar los 100 caracteres',
  })
  search?: string;
}
