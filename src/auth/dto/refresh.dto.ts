import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshDto {
  @ApiPropertyOptional({
    example: 'b7Zk…token opaco de 64 caracteres…',
    description:
      'El refresh token emitido en login/register o en un refresh anterior. ' +
      'Si no se envía, se lee de la cookie refreshToken (httpOnly).',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
