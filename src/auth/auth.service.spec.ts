import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { QueryFailedError } from 'typeorm';
import { User, UserRole } from '../users/user.entity';
import { AuthService } from './auth.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { RefreshToken } from './refresh-token.entity';
import { RevokedToken } from './revoked-token.entity';

interface QueryBuilderMock {
  addSelect: jest.Mock;
  where: jest.Mock;
  getOne: jest.Mock;
}

describe('AuthService', () => {
  let service: AuthService;
  let repository: Record<string, jest.Mock>;
  let refreshTokensRepository: Record<string, jest.Mock>;
  let revokedTokensRepository: Record<string, jest.Mock>;
  let jwt: { sign: jest.Mock };
  let createdData: Partial<User> | undefined;

  const registerDto: RegisterDto = {
    email: '  Test@Example.COM  ',
    password: 'Password123!',
    firstName: 'Test',
    lastName: 'User',
  };

  const loginDto: LoginDto = {
    email: 'Test@Example.COM',
    password: 'Password123!',
  };

  function mockQueryBuilder(user: User | null): QueryBuilderMock {
    return {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(user),
    };
  }

  function buildUser(overrides: Partial<User> = {}): User {
    return {
      id: '22222222-2222-2222-2222-222222222222',
      email: 'test@example.com',
      passwordHash: 'hashed',
      firstName: 'Test',
      lastName: 'User',
      phone: null,
      role: UserRole.CUSTOMER,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  /** SHA-256 en hex del token opaco (mismo algoritmo que el servicio). */
  const hashOf = (token: string): string =>
    createHash('sha256').update(token).digest('hex');

  /** Extrae un argumento de una llamada mockeada con tipado seguro. */
  function callArg<T>(
    mock: jest.Mock,
    call: number,
    arg: number,
  ): T | undefined {
    const calls = mock.mock.calls as unknown[][];
    return calls[call]?.[arg] as T | undefined;
  }

  /** Refresh token vigente de prueba (con usuario cargado). */
  function makeRefreshToken(
    overrides: Partial<RefreshToken> = {},
  ): RefreshToken {
    return {
      id: '33333333-3333-3333-3333-333333333333',
      userId: buildUser().id,
      user: buildUser(),
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      createdAt: new Date(),
      ...overrides,
    };
  }

  beforeEach(async () => {
    createdData = undefined;
    repository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    refreshTokensRepository = {
      create: jest.fn().mockImplementation((data: Partial<RefreshToken>) => ({
        ...data,
      })),
      save: jest
        .fn()
        .mockImplementation((data: Partial<RefreshToken>) =>
          Promise.resolve(makeRefreshToken({ ...data })),
        ),
      findOne: jest.fn(),
      // Rotación atómica: por defecto el UPDATE condicional revoca la fila
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    revokedTokensRepository = {
      insert: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        delete: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue(undefined),
          }),
        }),
      }),
    };
    jwt = { sign: jest.fn().mockReturnValue('signed-token') };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: repository },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: refreshTokensRepository,
        },
        {
          provide: getRepositoryToken(RevokedToken),
          useValue: revokedTokensRepository,
        },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => undefined) },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('normaliza el email a minúsculas y guarda el hash bcrypt (nunca la contraseña en claro)', async () => {
      repository.findOne.mockResolvedValue(null);
      repository.create.mockImplementation((data: Partial<User>) => {
        createdData = data;
        return data;
      });
      repository.save.mockImplementation((data: Partial<User>) => ({
        id: '11111111-1111-1111-1111-111111111111',
        role: UserRole.CUSTOMER,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      }));

      const result = await service.register(registerDto);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@example.com' }),
      );

      expect(createdData?.email).toBe('test@example.com');
      expect(createdData?.passwordHash).toBeDefined();
      expect(createdData?.passwordHash).not.toBe('Password123!');
      await expect(
        bcrypt.compare('Password123!', createdData?.passwordHash ?? ''),
      ).resolves.toBe(true);

      expect(jwt.sign).toHaveBeenCalledWith(
        {
          sub: '11111111-1111-1111-1111-111111111111',
          email: 'test@example.com',
          role: UserRole.CUSTOMER,
        },
        expect.anything(),
      );
      // El access token lleva un jti (UUID aleatorio) para poder revocarlo
      const signOptions = callArg<{ jwtid?: unknown }>(jwt.sign, 0, 1);
      expect(typeof signOptions?.jwtid).toBe('string');

      expect(result.access_token).toBe('signed-token');
      expect(result.refresh_token).toBeDefined();
      // El refresh token se guarda hasheado (SHA-256 del token emitido), nunca en claro
      expect(refreshTokensRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: '11111111-1111-1111-1111-111111111111',
          tokenHash: hashOf(result.refresh_token),
        }),
      );
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('lanza ConflictException si el email ya existe', async () => {
      repository.findOne.mockResolvedValue({
        id: 'x',
        email: 'test@example.com',
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('convierte la violación de unicidad de PostgreSQL (23505) en ConflictException', async () => {
      repository.findOne.mockResolvedValue(null);
      repository.create.mockImplementation((data: Partial<User>) => data);
      repository.save.mockRejectedValue(
        new QueryFailedError('INSERT INTO users', [], { code: '23505' }),
      );

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('login', () => {
    it('devuelve access_token y refresh_token cuando las credenciales son válidas', async () => {
      const passwordHash = await bcrypt.hash('Password123!', 4);
      const qb = mockQueryBuilder(buildUser({ passwordHash }));
      repository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.login(loginDto);

      expect(repository.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(qb.addSelect).toHaveBeenCalledWith('user.passwordHash');
      expect(qb.where).toHaveBeenCalledWith('user.email = :email', {
        email: 'test@example.com',
      });
      expect(result.access_token).toBe('signed-token');
      expect(result.refresh_token).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('lanza UnauthorizedException si el usuario no existe', async () => {
      const qb = mockQueryBuilder(null);
      repository.createQueryBuilder.mockReturnValue(qb);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('lanza UnauthorizedException si la contraseña no coincide', async () => {
      const passwordHash = await bcrypt.hash('OtraPasswordDistinta', 4);
      const qb = mockQueryBuilder(buildUser({ passwordHash }));
      repository.createQueryBuilder.mockReturnValue(qb);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    it('rota el token: revoca el presentado y emite un nuevo par', async () => {
      const token = makeRefreshToken();
      refreshTokensRepository.findOne.mockResolvedValue(token);

      const result = await service.refresh({
        refreshToken: 'token-opaco-de-prueba',
      });

      expect(refreshTokensRepository.findOne).toHaveBeenCalledWith({
        where: { tokenHash: hashOf('token-opaco-de-prueba') },
        relations: { user: true },
      });
      // Rotación atómica: el UPDATE condicional revoca el token presentado
      expect(refreshTokensRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: token.id }),
        expect.anything(),
      );
      const rotatedArg = callArg<{ revokedAt?: unknown }>(
        refreshTokensRepository.update,
        0,
        1,
      );
      expect(rotatedArg?.revokedAt).toBeInstanceOf(Date);
      // Se emite un refresh token nuevo
      expect(refreshTokensRepository.create).toHaveBeenCalled();
      expect(result.access_token).toBe('signed-token');
      expect(result.refresh_token).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
    });

    it('lanza UnauthorizedException si el token no existe', async () => {
      refreshTokensRepository.findOne.mockResolvedValue(null);

      await expect(
        service.refresh({ refreshToken: 'desconocido' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('reusar un token ya rotado revoca TODAS las sesiones del usuario', async () => {
      const token = makeRefreshToken({ revokedAt: new Date() });
      refreshTokensRepository.findOne.mockResolvedValue(token);
      // La rotación atómica falla (affected 0): el token ya estaba revocado
      refreshTokensRepository.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.refresh({ refreshToken: 'token-ya-rotado' }),
      ).rejects.toThrow(UnauthorizedException);

      // Medida anti-robo: cierra todas las sesiones del usuario
      expect(refreshTokensRepository.update).toHaveBeenCalledWith(
        { userId: token.userId },
        expect.anything(),
      );
      const updateArg = callArg<{ revokedAt?: unknown }>(
        refreshTokensRepository.update,
        0,
        1,
      );
      expect(updateArg?.revokedAt).toBeInstanceOf(Date);
    });

    it('lanza UnauthorizedException si el token está expirado', async () => {
      const token = makeRefreshToken({
        expiresAt: new Date(Date.now() - 1000),
      });
      refreshTokensRepository.findOne.mockResolvedValue(token);

      await expect(
        service.refresh({ refreshToken: 'token-expirado' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('blacklistea el access token (jti) y limpia la blacklist vencida', async () => {
      await service.logout('jti-actual', {});

      expect(revokedTokensRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({ jti: 'jti-actual' }),
      );
      const insertArg = callArg<{ expiresAt?: unknown }>(
        revokedTokensRepository.insert,
        0,
        0,
      );
      expect(insertArg?.expiresAt).toBeInstanceOf(Date);
      expect(revokedTokensRepository.createQueryBuilder).toHaveBeenCalled();
    });

    it('revoca también el refresh token si se envía', async () => {
      await service.logout('jti-actual', {
        refreshToken: 'refresh-a-revocar',
      });

      expect(refreshTokensRepository.update).toHaveBeenCalledWith(
        { tokenHash: hashOf('refresh-a-revocar') },
        expect.anything(),
      );
      const updateArg = callArg<{ revokedAt?: unknown }>(
        refreshTokensRepository.update,
        0,
        1,
      );
      expect(updateArg?.revokedAt).toBeInstanceOf(Date);
    });
  });
});
