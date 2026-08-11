import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  @ApiPropertyOptional({
    example: 'b7Zk…token opaco de 64 caracteres…',
    description:
      'El refresh token de la sesión (se revoca). Si no se envía, solo se revoca el access token.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El refresh token no puede estar vacío' })
  refreshToken?: string;
}
