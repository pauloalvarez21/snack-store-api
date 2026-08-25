import { Injectable, Logger } from '@nestjs/common';

export type SecurityEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'REGISTER_SUCCESS'
  | 'REGISTER_FAILED'
  | 'LOGOUT'
  | 'TOKEN_REFRESH'
  | 'TOKEN_REFRESH_FAILED'
  | 'TOKEN_REVOKED'
  | 'PASSWORD_CHANGED'
  | 'UNAUTHORIZED_ACCESS'
  | 'ROLE_CHANGED';

export interface SecurityEvent {
  type: SecurityEventType;
  userId?: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  details?: string;
}

@Injectable()
export class SecurityLogger {
  private readonly logger = new Logger('Security');

  log(event: SecurityEvent): void {
    const message = this.formatMessage(event);

    switch (event.type) {
      case 'LOGIN_FAILED':
      case 'REGISTER_FAILED':
      case 'TOKEN_REFRESH_FAILED':
      case 'UNAUTHORIZED_ACCESS':
        this.logger.warn(message);
        break;
      default:
        this.logger.log(message);
    }
  }

  private formatMessage(event: SecurityEvent): string {
    const parts = [`${event.type}`];

    if (event.userId) parts.push(`userId=${event.userId}`);
    if (event.email) parts.push(`email=${event.email}`);
    if (event.ip) parts.push(`ip=${event.ip}`);
    if (event.userAgent) parts.push(`ua=${event.userAgent}`);
    if (event.details) parts.push(`info=${event.details}`);

    return parts.join(' | ');
  }

  /**
   * Extrae IP y User-Agent del request de Express
   */
  static extractRequestInfo(req: any): { ip?: string; userAgent?: string } {
    if (!req) return {};
    return {
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers?.['user-agent'],
    };
  }
}
