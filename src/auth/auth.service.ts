import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { isUniqueViolation } from '../common/db-errors';
import { User } from '../users/user.entity';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshToken } from './refresh-token.entity';
import { RevokedToken } from './revoked-token.entity';

const BCRYPT_ROUNDS = 10;

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: PublicUser;
}

/** Convierte "1h", "7d", "30m", "5000" en milisegundos (fallback si no parsea). */
function parseDuration(value: string | undefined, fallbackMs: number): number {
  if (!value) return fallbackMs;
  const match = /^(\d+)\s*(ms|s|m|h|d)?$/i.exec(value.trim());
  if (!match) return fallbackMs;
  const n = Number(match[1]);
  const unit = (match[2] ?? 'ms').toLowerCase();
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return n * multipliers[unit];
}

@Injectable()
export class AuthService {
  private readonly refreshTokenMs: number;
  private readonly accessTokenMs: number;

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
    @InjectRepository(RevokedToken)
    private readonly revokedTokensRepository: Repository<RevokedToken>,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.refreshTokenMs = parseDuration(
      configService.get('REFRESH_TOKEN_EXPIRES_IN'),
      7 * 86_400_000, // default: 7 días
    );
    this.accessTokenMs = parseDuration(
      configService.get('JWT_EXPIRES_IN'),
      3_600_000, // default: 1 hora
    );
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.usersRepository.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con este email');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = this.usersRepository.create({
      email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone ?? null,
    });

    try {
      const saved = await this.usersRepository.save(user);
      return await this.buildAuthResponse(saved);
    } catch (error) {
      // Carrera TOCTOU: si dos registros simultáneos pisan el pre-check,
      // PostgreSQL rechaza el INSERT con violación de unicidad (23505)
      if (isUniqueViolation(error)) {
        throw new ConflictException('Ya existe una cuenta con este email');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();

    const user = await this.usersRepository
      .createQueryBuilder('user')
      // select: false oculta el hash por defecto: lo pedimos explícitamente aquí
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return await this.buildAuthResponse(user);
  }

  /**
   * Renueva el access token con un refresh token (rotación).
   * El token presentado se revoca al usarlo; reutilizar un token ya rotado
   * se considera robo y revoca TODAS las sesiones del usuario.
   */
  async refresh(dto: RefreshDto): Promise<AuthResponse> {
    const tokenHash = this.hashToken(dto.refreshToken);
    const token = await this.refreshTokensRepository.findOne({
      where: { tokenHash },
      relations: { user: true },
    });

    if (!token) {
      throw new UnauthorizedException('Refresh token inválido o revocado');
    }

    if (token.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    // Rotación atómica: la condición revoked_at IS NULL en el UPDATE garantiza
    // que solo una petición concurrente puede consumir el token (TOCTOU).
    const rotated = await this.refreshTokensRepository.update(
      { id: token.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    if (rotated.affected === 0) {
      // El token ya fue usado por otra petición (concurrente o pasada):
      // posible robo → cerrar TODAS las sesiones del usuario
      await this.refreshTokensRepository.update(
        { userId: token.userId },
        { revokedAt: new Date() },
      );
      throw new UnauthorizedException('Refresh token inválido o revocado');
    }

    return {
      access_token: this.signAccessToken(token.user),
      refresh_token: await this.createRefreshToken(token.userId),
      user: this.toPublicUser(token.user),
    };
  }

  /** Cierra la sesión: revoca el refresh token y el access token actual. */
  async logout(accessJti: string, dto: LogoutDto): Promise<void> {
    if (dto.refreshToken) {
      await this.refreshTokensRepository.update(
        { tokenHash: this.hashToken(dto.refreshToken) },
        { revokedAt: new Date() },
      );
    }

    // Blacklist del access token actual hasta que venza su expiración
    await this.revokedTokensRepository.insert({
      jti: accessJti,
      expiresAt: new Date(Date.now() + this.accessTokenMs),
    });

    // Limpieza barata de la blacklist vencida (los access tokens viven poco)
    await this.revokedTokensRepository
      .createQueryBuilder()
      .delete()
      .where('expires_at < :now', { now: new Date() })
      .execute();
  }

  private async buildAuthResponse(user: User): Promise<AuthResponse> {
    return {
      access_token: this.signAccessToken(user),
      refresh_token: await this.createRefreshToken(user.id),
      user: this.toPublicUser(user),
    };
  }

  private signAccessToken(user: User): string {
    return this.jwtService.sign(
      { sub: user.id, email: user.email, role: user.role },
      // jti: permite revocar el token individualmente en el logout
      { jwtid: randomUUID() },
    );
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const raw = randomBytes(48).toString('base64url');
    await this.refreshTokensRepository.save(
      this.refreshTokensRepository.create({
        userId,
        tokenHash: this.hashToken(raw),
        expiresAt: new Date(Date.now() + this.refreshTokenMs),
      }),
    );
    return raw;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
    };
  }
}
