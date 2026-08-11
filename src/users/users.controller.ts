import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { RequestUser } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { Paginated } from '../common/pagination';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UserRole } from './user.entity';
import type { UserResponse } from './users.service';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Nota: las rutas /users/me van ANTES de /users/:id para que "me"
  // no se interprete como un id.

  @Get('me')
  @ApiOperation({ summary: 'Mi perfil completo' })
  findMe(@CurrentUser() user: RequestUser): Promise<UserResponse> {
    return this.usersService.findMe(user.id);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Actualizar mi perfil (nombre, apellido, teléfono)',
  })
  updateMe(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponse> {
    return this.usersService.updateMe(user.id, dto);
  }

  @Post('me/change-password')
  @HttpCode(HttpStatus.OK)
  // Límite estricto: la verificación de contraseña actual es objetivo de fuerza bruta
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cambiar mi contraseña' })
  changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.usersService.changePassword(user.id, dto);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar usuarios (solo ADMIN, paginado)' })
  findAll(@Query() query: ListUsersDto): Promise<Paginated<UserResponse>> {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Detalle de un usuario (solo ADMIN)' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponse> {
    return this.usersService.findOne(id);
  }

  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cambiar el rol de un usuario (solo ADMIN)' })
  updateRole(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
  ): Promise<UserResponse> {
    return this.usersService.updateRole(id, dto, user.id);
  }
}
