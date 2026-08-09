import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsInt, IsOptional, Max, Min } from 'class-validator';

export class SalesReportDto {
  @ApiPropertyOptional({
    description: 'Incluir ventas desde esta fecha (ISO 8601)',
    example: '2026-08-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'from debe ser una fecha ISO 8601' })
  from?: string;

  @ApiPropertyOptional({
    description: 'Incluir ventas hasta esta fecha (ISO 8601)',
    example: '2026-08-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'to debe ser una fecha ISO 8601' })
  to?: string;

  @ApiPropertyOptional({
    description: 'Cantidad de productos en el top (por monto)',
    example: 10,
    minimum: 1,
    maximum: 50,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  topLimit?: number;
}
