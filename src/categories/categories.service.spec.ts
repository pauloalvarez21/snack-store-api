import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { CategoriesService } from './categories.service';
import { Category } from './category.entity';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let repository: Record<string, jest.Mock>;
  let createdData: Partial<Category> | undefined;

  const category: Category = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Frutas',
    slug: 'frutas',
    description: null,
    parentId: null,
    isActive: true,
    createdAt: new Date(),
  };

  function mockQueryBuilder(rows: Category[], total: number) {
    return {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([rows, total]),
    };
  }

  beforeEach(async () => {
    createdData = undefined;
    repository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
      exists: jest.fn(),
      remove: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: getRepositoryToken(Category), useValue: repository },
      ],
    }).compile();

    service = module.get(CategoriesService);
  });

  describe('findAll', () => {
    it('devuelve una respuesta paginada', async () => {
      repository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder([category], 1),
      );

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
      expect(result.data[0]).toEqual(
        expect.objectContaining({ slug: 'frutas' }),
      );
    });

    it('aplica el filtro de activos', async () => {
      const qb = mockQueryBuilder([], 0);
      repository.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ active: 'true' });

      expect(qb.andWhere).toHaveBeenCalledWith('category.isActive = :active', {
        active: true,
      });
    });

    it('aplica el filtro de categoría padre', async () => {
      const qb = mockQueryBuilder([], 0);
      repository.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ parentId: 'parent-id' });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'category.parentId = :parentId',
        { parentId: 'parent-id' },
      );
    });
  });

  describe('findOne', () => {
    it('devuelve la categoría si existe', async () => {
      repository.findOne.mockResolvedValue(category);

      const result = await service.findOne(category.id);

      expect(result.slug).toBe('frutas');
    });

    it('lanza NotFoundException si no existe', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('genera el slug automáticamente desde el nombre', async () => {
      repository.findOne.mockResolvedValue(null);
      repository.create.mockImplementation((data: Partial<Category>) => {
        createdData = data;
        return data;
      });
      repository.save.mockImplementation((data: Partial<Category>) => ({
        id: 'new-id',
        createdAt: new Date(),
        ...data,
      }));

      const result = await service.create({ name: 'Frutas Frescas' });

      expect(createdData?.slug).toBe('frutas-frescas');
      expect(result.slug).toBe('frutas-frescas');
    });

    it('añade sufijo numérico si el slug ya existe', async () => {
      repository.findOne
        .mockResolvedValueOnce({ ...category })
        .mockResolvedValueOnce(null);
      repository.create.mockImplementation((data: Partial<Category>) => {
        createdData = data;
        return data;
      });
      repository.save.mockImplementation((data: Partial<Category>) => ({
        id: 'new-id',
        createdAt: new Date(),
        ...data,
      }));

      await service.create({ name: 'Frutas' });

      expect(createdData?.slug).toBe('frutas-2');
    });

    it('lanza BadRequestException si la categoría padre no existe', async () => {
      repository.exists.mockResolvedValue(false);

      await expect(
        service.create({ name: 'Sub', parentId: 'parent-id' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('convierte la violación de unicidad en ConflictException', async () => {
      repository.findOne.mockResolvedValue(null);
      repository.create.mockImplementation((data: Partial<Category>) => data);
      repository.save.mockRejectedValue(
        new QueryFailedError('INSERT', [], { code: '23505' }),
      );

      await expect(service.create({ name: 'Frutas' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('update', () => {
    it('regenera el slug al cambiar el nombre y permite limpiar description con null', async () => {
      const existing = {
        ...category,
        description: 'texto viejo',
      };
      repository.findOne
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(null);
      repository.save.mockImplementation((data: Category) => data);

      const result = await service.update(category.id, {
        name: 'Frutas Frescas',
        description: null,
      });

      expect(result.name).toBe('Frutas Frescas');
      expect(result.slug).toBe('frutas-frescas');
      expect(result.description).toBeNull();
    });

    it('lanza NotFoundException si la categoría no existe', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.update(category.id, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('elimina la categoría existente', async () => {
      repository.findOne.mockResolvedValue(category);

      await service.remove(category.id);

      expect(repository.remove).toHaveBeenCalledWith(category);
    });

    it('lanza NotFoundException si no existe', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.remove('x')).rejects.toThrow(NotFoundException);
    });
  });
});
