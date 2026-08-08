import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'juan.perez@example.com', format: 'email' })
  @IsEmail({}, { message: 'Debe ser un email válido' })
  email: string;

  @ApiProperty({ example: 'MiClaveSegura123!' })
  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  password: string;
}
