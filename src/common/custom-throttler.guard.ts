import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type {
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';

/**
 * ThrottlerGuard personalizado que genera una key única combinando:
 * - IP del cliente (para requests no autenticados)
 * - userId (para requests autenticados)
 *
 * Esto previene que un atacante con múltiples IPs evada el rate limiting
 * por usuario, y también previene que un usuario autenticado sea limitado
 * por la IP compartida (ej. VPN, NAT, datacenter).
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  protected getTracker(req: Record<string, any>): Promise<string> {
    const userId = req.user?.id;
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';

    // Si el usuario está autenticado, usar userId + IP como key
    // (un usuario autenticado desde múltiples IPs sigue siendo limitado por usuario)
    if (userId) {
      return Promise.resolve(`user:${userId}:${ip}`);
    }

    // Para requests no autenticados, usar solo IP
    return Promise.resolve(`ip:${ip}`);
  }
}
