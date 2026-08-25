import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { SecurityLogger } from '../common/security-logger';
import type { AuthResponse } from './auth.service';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { RequestUser } from './jwt.strategy';

/** Milisegundos → segundos para el atributo Max-Age de la cookie. */
function msToSeconds(ms: number): number {
  return Math.floor(ms / 1000);
}

/** Parsea "7d", "12h", "30m" a milisegundos (fallback si no parsea). */
function parseDurationMs(
  value: string | undefined,
  fallbackMs: number,
): number {
  if (!value) return fallbackMs;
  const m = /^(\d+)\s*(ms|s|m|h|d)?$/i.exec(value.trim());
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  const unit = (m[2] ?? 'ms').toLowerCase();
  const mult: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return n * (mult[unit] ?? 1);
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly refreshCookieMaxAge: number;

  constructor(
    private readonly authService: AuthService,
    private readonly securityLogger: SecurityLogger,
    private readonly configService: ConfigService,
  ) {
    this.refreshCookieMaxAge = msToSeconds(
      parseDurationMs(
        configService.get('REFRESH_TOKEN_EXPIRES_IN'),
        7 * 86_400_000,
      ),
    );
  }

  /** Flags de la cookie del refresh token (httpOnly, secure, sameSite). */
  private refreshCookieOptions() {
    const isProd = this.configService.get('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict' as const,
      path: '/api/auth',
      maxAge: this.refreshCookieMaxAge,
    };
  }

  /** Setea la cookie del refresh token en la respuesta. */
  private setRefreshCookie(res: Response, token: string): void {
    res.cookie('refreshToken', token, this.refreshCookieOptions());
  }

  /** Borra la cookie del refresh token (logout). */
  private clearRefreshCookie(res: Response): void {
    res.cookie('refreshToken', '', {
      ...this.refreshCookieOptions(),
      maxAge: 0,
    });
  }

  @Post('register')
  // Límite estricto contra abuso de registro: 10/minuto por IP
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Registrar un nuevo usuario (rol CUSTOMER)' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { ip, userAgent } = SecurityLogger.extractRequestInfo(req);
    try {
      const result = await this.authService.register(dto);
      this.setRefreshCookie(res, result.refresh_token);
      this.securityLogger.log({
        type: 'REGISTER_SUCCESS',
        email: dto.email,
        ip,
        userAgent,
      });
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.securityLogger.log({
        type: 'REGISTER_FAILED',
        email: dto.email,
        ip,
        userAgent,
        details: message,
      });
      throw error;
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Límite estricto contra fuerza bruta: 10 intentos/minuto por IP
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Iniciar sesión y obtener un token JWT' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { ip, userAgent } = SecurityLogger.extractRequestInfo(req);
    try {
      const result = await this.authService.login(dto);
      this.setRefreshCookie(res, result.refresh_token);
      this.securityLogger.log({
        type: 'LOGIN_SUCCESS',
        email: dto.email,
        userId: result.user.id,
        ip,
        userAgent,
      });
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.securityLogger.log({
        type: 'LOGIN_FAILED',
        email: dto.email,
        ip,
        userAgent,
        details: message,
      });
      throw error;
    }
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  // El refresh token es una credencial: límite contra abuso
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Renovar el access token con un refresh token (rotación)',
  })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { ip, userAgent } = SecurityLogger.extractRequestInfo(req);

    // Prioridad: cookie → body (backward-compatible con clientes que envían en el body)
    const refreshToken = req.cookies?.refreshToken ?? dto.refreshToken;
    if (!refreshToken) {
      this.securityLogger.log({
        type: 'TOKEN_REFRESH_FAILED',
        ip,
        userAgent,
        details: 'No se proporcionó refresh token (ni cookie ni body)',
      });
      throw new Error('Refresh token requerido');
    }

    try {
      const result = await this.authService.refresh({ refreshToken });
      this.setRefreshCookie(res, result.refresh_token);
      this.securityLogger.log({
        type: 'TOKEN_REFRESH',
        userId: result.user.id,
        ip,
        userAgent,
      });
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.securityLogger.log({
        type: 'TOKEN_REFRESH_FAILED',
        ip,
        userAgent,
        details: message,
      });
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Cerrar sesión: revoca el access token actual y el refresh token',
  })
  async logout(
    @CurrentUser() user: RequestUser,
    @Body() dto: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const { ip, userAgent } = SecurityLogger.extractRequestInfo(req);

    // Si el refresh token viene en la cookie, revocarlo también
    const cookieToken = req.cookies?.refreshToken;
    if (cookieToken && !dto.refreshToken) {
      dto.refreshToken = cookieToken;
    }

    this.clearRefreshCookie(res);
    await this.authService.logout(user.jti, dto);
    this.securityLogger.log({
      type: 'LOGOUT',
      userId: user.id,
      email: user.email,
      ip,
      userAgent,
    });
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Obtener el perfil del usuario autenticado' })
  profile(@CurrentUser() user: RequestUser): RequestUser {
    return user;
  }
}
