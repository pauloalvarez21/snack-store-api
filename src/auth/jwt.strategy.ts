import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { SecurityLogger } from '../common/security-logger';
import { UserRole } from '../users/user.entity';
import { RevokedToken } from './revoked-token.entity';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  jti: string;
}

export interface RequestUser {
  id: string;
  email: string;
  role: UserRole;
  jti: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(RevokedToken)
    private readonly revokedTokensRepository: Repository<RevokedToken>,
    private readonly securityLogger: SecurityLogger,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    if (!payload.jti) {
      throw new UnauthorizedException('Token sin identificador');
    }

    // Revocación: los tokens blacklisted en el logout se rechazan
    const revoked = await this.revokedTokensRepository.exists({
      where: { jti: payload.jti },
    });
    if (revoked) {
      this.securityLogger.log({
        type: 'TOKEN_REVOKED',
        userId: payload.sub,
        email: payload.email,
        details: `jti=${payload.jti}`,
      });
      throw new UnauthorizedException('Token revocado');
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      jti: payload.jti,
    };
  }
}
