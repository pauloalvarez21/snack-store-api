import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import {
  buildPaginated,
  getPaginationOptions,
  Paginated,
} from '../common/pagination';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { User, UserRole } from './user.entity';

const BCRYPT_ROUNDS = 10;

export interface UserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

function toResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  /** Perfil completo del usuario autenticado. */
  async findMe(userId: string): Promise<UserResponse> {
    return toResponse(await this.ensureExists(userId));
  }

  /** Actualiza el propio perfil (nombre, apellido, teléfono). */
  async updateMe(userId: string, dto: UpdateProfileDto): Promise<UserResponse> {
    const user = await this.ensureExists(userId);

    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.phone !== undefined) user.phone = dto.phone ?? null;

    return toResponse(await this.usersRepository.save(user));
  }

  /** Cambia la contraseña tras verificar la actual. */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      // select: false oculta el hash por defecto: lo pedimos explícitamente aquí
      .addSelect('user.passwordHash')
      .where('user.id = :userId', { userId })
      .getOne();

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const currentMatches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!currentMatches) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.usersRepository.save(user);
  }

  /** Lista usuarios con paginación, filtro por rol y búsqueda (solo ADMIN). */
  async findAll(query: ListUsersDto): Promise<Paginated<UserResponse>> {
    const { skip, take, page, limit } = getPaginationOptions(
      query.page,
      query.limit,
    );

    const qb = this.usersRepository.createQueryBuilder('user');

    if (query.role !== undefined) {
      qb.andWhere('user.role = :role', { role: query.role });
    }
    if (query.search !== undefined) {
      qb.andWhere(
        '(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    const [rows, total] = await qb
      .orderBy('user.createdAt', 'DESC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return buildPaginated(rows.map(toResponse), total, page, limit);
  }

  /** Detalle de un usuario (solo ADMIN). */
  async findOne(id: string): Promise<UserResponse> {
    return toResponse(await this.ensureExists(id));
  }

  /** Cambia el rol de un usuario (solo ADMIN). */
  async updateRole(
    id: string,
    dto: UpdateUserRoleDto,
    currentUserId: string,
  ): Promise<UserResponse> {
    // Evita que un ADMIN se quite su propio rol y deje el sistema sin administradores
    if (id === currentUserId) {
      throw new BadRequestException('No puedes cambiar tu propio rol');
    }

    const user = await this.ensureExists(id);
    user.role = dto.role;

    return toResponse(await this.usersRepository.save(user));
  }

  private async ensureExists(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return user;
  }
}
