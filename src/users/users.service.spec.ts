import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './user.entity';
import { UsersService } from './users.service';

interface QueryBuilderMock {
  addSelect: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getOne: jest.Mock;
  getManyAndCount: jest.Mock;
}

describe('UsersService', () => {
  let service: UsersService;
  let repository: Record<string, jest.Mock>;
  let savedUser: User | undefined;

  const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const adminId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const makeUser = (overrides: Partial<User> = {}): User => ({
    id: userId,
    email: 'cliente@snack.store',
    passwordHash: 'hashed',
    firstName: 'Cliente',
    lastName: 'Demo',
    phone: null,
    role: UserRole.CUSTOMER,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  function buildQueryBuilder(user: User | null): QueryBuilderMock {
    return {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(user),
      getManyAndCount: jest.fn(),
    };
  }

  beforeEach(async () => {
    savedUser = undefined;
    repository = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((data: Partial<User>) => {
        savedUser = { ...makeUser(), ...data };
        return Promise.resolve(savedUser);
      }),
      createQueryBuilder: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repository },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('findMe', () => {
    it('devuelve el perfil del usuario sin passwordHash', async () => {
      repository.findOne.mockResolvedValue(makeUser());

      const result = await service.findMe(userId);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(result.email).toBe('cliente@snack.store');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findMe(userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateMe', () => {
    it('actualiza solo los campos enviados', async () => {
      repository.findOne.mockResolvedValue(makeUser());

      const result = await service.updateMe(userId, {
        firstName: 'Juan',
        phone: '+56912345678',
      });

      expect(result.firstName).toBe('Juan');
      expect(result.lastName).toBe('Demo');
      expect(result.phone).toBe('+56912345678');
    });

    it('enviar null en phone limpia el teléfono', async () => {
      repository.findOne.mockResolvedValue(makeUser({ phone: '+56911111111' }));

      const result = await service.updateMe(userId, { phone: null });

      expect(result.phone).toBeNull();
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.updateMe(userId, { firstName: 'Juan' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('changePassword', () => {
    it('lanza BadRequestException si la contraseña actual es incorrecta', async () => {
      const passwordHash = await bcrypt.hash('Actual123!', 4);
      const qb = buildQueryBuilder(makeUser({ passwordHash }));
      repository.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.changePassword(userId, {
          currentPassword: 'Incorrecta123!',
          newPassword: 'Nueva123!',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('guarda el hash de la nueva contraseña (nunca la contraseña en claro)', async () => {
      const passwordHash = await bcrypt.hash('Actual123!', 4);
      const qb = buildQueryBuilder(makeUser({ passwordHash }));
      repository.createQueryBuilder.mockReturnValue(qb);

      await service.changePassword(userId, {
        currentPassword: 'Actual123!',
        newPassword: 'NuevaSegura456!',
      });

      expect(repository.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(qb.addSelect).toHaveBeenCalledWith('user.passwordHash');
      expect(qb.where).toHaveBeenCalledWith('user.id = :userId', { userId });

      expect(savedUser?.passwordHash).toBeDefined();
      expect(savedUser?.passwordHash).not.toBe('NuevaSegura456!');
      await expect(
        bcrypt.compare('NuevaSegura456!', savedUser?.passwordHash ?? ''),
      ).resolves.toBe(true);
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      const qb = buildQueryBuilder(null);
      repository.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.changePassword(userId, {
          currentPassword: 'Actual123!',
          newPassword: 'Nueva123!',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('devuelve la lista paginada sin passwordHash', async () => {
      const qb = buildQueryBuilder(null);
      qb.getManyAndCount.mockResolvedValue([
        [makeUser(), makeUser({ id: 'otro', role: UserRole.ADMIN })],
        2,
      ]);
      repository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll({});

      expect(qb.orderBy).toHaveBeenCalledWith('user.createdAt', 'DESC');
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(result.total).toBe(2);
      expect(result.totalPages).toBe(1);
      expect(result.data[0]).not.toHaveProperty('passwordHash');
    });

    it('aplica el filtro por rol cuando se envía', async () => {
      const qb = buildQueryBuilder(null);
      qb.getManyAndCount.mockResolvedValue([[makeUser()], 1]);
      repository.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ role: UserRole.DELIVERY });

      expect(qb.andWhere).toHaveBeenCalledWith('user.role = :role', {
        role: UserRole.DELIVERY,
      });
    });

    it('aplica la búsqueda por email/nombre/apellido cuando se envía', async () => {
      const qb = buildQueryBuilder(null);
      qb.getManyAndCount.mockResolvedValue([[makeUser()], 1]);
      repository.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ search: 'juan' });

      expect(qb.andWhere).toHaveBeenCalledWith(
        '(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
        { search: '%juan%' },
      );
    });
  });

  describe('findOne', () => {
    it('lanza NotFoundException si el usuario no existe', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne(userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateRole', () => {
    it('lanza BadRequestException si el ADMIN intenta cambiar su propio rol', async () => {
      await expect(
        service.updateRole(adminId, { role: UserRole.CUSTOMER }, adminId),
      ).rejects.toThrow(BadRequestException);
      expect(repository.findOne).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.updateRole(userId, { role: UserRole.DELIVERY }, adminId),
      ).rejects.toThrow(NotFoundException);
    });

    it('cambia el rol y lo devuelve', async () => {
      repository.findOne.mockResolvedValue(makeUser());

      const result = await service.updateRole(
        userId,
        { role: UserRole.DELIVERY },
        adminId,
      );

      expect(result.role).toBe(UserRole.DELIVERY);
      expect(savedUser?.role).toBe(UserRole.DELIVERY);
    });
  });
});
