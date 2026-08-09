import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class ListDeliveriesDto {
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
    description:
      'Repartidor a filtrar (solo ADMIN). Por defecto usa el repartidor autenticado.',
    example: '8b1a2d5e-1111-1111-1111-111111111111',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'userId debe ser un UUID válido' })
  userId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar entregas desde esta fecha (ISO 8601)',
    example: '2026-08-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'from debe ser una fecha ISO 8601' })
  from?: string;

  @ApiPropertyOptional({
    description: 'Filtrar entregas hasta esta fecha (ISO 8601)',
    example: '2026-08-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'to debe ser una fecha ISO 8601' })
  to?: string;
}
