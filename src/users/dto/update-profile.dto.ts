import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Juan', maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100, {
    message: 'El nombre debe tener entre 1 y 100 caracteres',
  })
  firstName?: string;

  @ApiPropertyOptional({ example: 'Pérez', maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100, {
    message: 'El apellido debe tener entre 1 y 100 caracteres',
  })
  lastName?: string;

  @ApiPropertyOptional({
    example: '+56912345678',
    maxLength: 20,
    nullable: true,
    description: 'Enviar null para limpiar el teléfono',
  })
  @IsOptional()
  @IsString()
  @Length(1, 20, {
    message: 'El teléfono debe tener entre 1 y 20 caracteres',
  })
  phone?: string | null;
}
