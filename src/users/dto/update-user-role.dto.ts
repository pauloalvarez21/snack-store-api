import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { UserRole } from '../user.entity';

export class UpdateUserRoleDto {
  @ApiProperty({
    enum: UserRole,
    example: UserRole.DELIVERY,
    description: 'Nuevo rol del usuario',
  })
  @IsEnum(UserRole, { message: 'role no es válido' })
  role: UserRole;
}
