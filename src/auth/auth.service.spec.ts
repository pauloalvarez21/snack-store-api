import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { QueryFailedError } from 'typeorm';
import { User, UserRole } from '../users/user.entity';
import { AuthService } from './auth.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

interface QueryBuilderMock {
  addSelect: jest.Mock;
  where: jest.Mock;
  getOne: jest.Mock;
}

describe('AuthService', () => {
  let service: AuthService;
  let repository: Record<string, jest.Mock>;
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

  beforeEach(async () => {
    createdData = undefined;
    repository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    jwt = { sign: jest.fn().mockReturnValue('signed-token') };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: repository },
        { provide: JwtService, useValue: jwt },
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

      expect(jwt.sign).toHaveBeenCalledWith({
        sub: '11111111-1111-1111-1111-111111111111',
        email: 'test@example.com',
        role: UserRole.CUSTOMER,
      });
      expect(result.access_token).toBe('signed-token');
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
    it('devuelve access_token cuando las credenciales son válidas', async () => {
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
});
