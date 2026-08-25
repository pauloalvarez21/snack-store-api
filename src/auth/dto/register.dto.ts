import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'juan.perez@example.com', format: 'email' })
  @IsEmail({}, { message: 'Debe ser un email válido' })
  email: string;

  @ApiProperty({ example: 'MiClaveSegura123!', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(72, {
    message: 'La contraseña no puede superar los 72 caracteres',
  })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      'La contraseña debe contener al menos una letra mayúscula, una minúscula y un número',
  })
  password: string;

  @ApiProperty({ example: 'Juan', maxLength: 100 })
  @IsString()
  @Length(1, 100, { message: 'El nombre debe tener entre 1 y 100 caracteres' })
  firstName: string;

  @ApiProperty({ example: 'Pérez', maxLength: 100 })
  @IsString()
  @Length(1, 100, {
    message: 'El apellido debe tener entre 1 y 100 caracteres',
  })
  lastName: string;

  @ApiPropertyOptional({ example: '+56912345678', maxLength: 20 })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  phone?: string;
}
