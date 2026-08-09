import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateAddressDto {
  @ApiProperty({ example: 'Av. Providencia 1234, Depto 501' })
  @IsString()
  @IsNotEmpty({ message: 'addressLine1 no puede estar vacío' })
  @MaxLength(255, { message: 'addressLine1 no puede superar 255 caracteres' })
  addressLine1: string;

  @ApiPropertyOptional({ example: 'Torre B' })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'addressLine2 no puede superar 255 caracteres' })
  addressLine2?: string;

  @ApiProperty({ example: 'Santiago' })
  @IsString()
  @IsNotEmpty({ message: 'city no puede estar vacío' })
  @MaxLength(100, { message: 'city no puede superar 100 caracteres' })
  city: string;

  @ApiPropertyOptional({ example: 'Región Metropolitana' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'stateProvince no puede superar 100 caracteres' })
  stateProvince?: string;

  @ApiPropertyOptional({ example: '7500000' })
  @IsOptional()
  @IsString()
  @Length(1, 20, { message: 'postalCode debe tener entre 1 y 20 caracteres' })
  postalCode?: string;

  @ApiPropertyOptional({
    example: 'Llamar al llegar, portería no responde.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'deliveryNotes no puede superar 500 caracteres' })
  deliveryNotes?: string;

  @ApiPropertyOptional({
    description: 'Marca esta dirección como la principal del usuario',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isDefault debe ser un booleano' })
  isDefault?: boolean;
}
