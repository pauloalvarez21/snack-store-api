import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { Category } from '../categories/category.entity';
import { Product } from './product.entity';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let productsRepository: Record<string, jest.Mock>;
  let categoriesRepository: Record<string, jest.Mock>;

  const product: Product = {
    id: '22222222-2222-2222-2222-222222222222',
    categoryId: null,
    category: null,
    sku: 'MANZ-001',
    name: 'Manzana',
    slug: 'manzana',
    description: null,
    price: '2.50',
    salePrice: null,
    unit: 'kg',
    isPerishable: false,
    isOrganic: false,
    imageUrl: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    productsRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
      remove: jest.fn(),
    };
    categoriesRepository = { exists: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: productsRepository },
        {
          provide: getRepositoryToken(Category),
          useValue: categoriesRepository,
        },
      ],
    }).compile();

    service = module.get(ProductsService);
  });

  describe('findAll', () => {
    it('aplica filtros de categoría, activos y búsqueda ILIKE', async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[product], 1]),
      };
      productsRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll({
        search: 'manz',
        active: 'true',
        categoryId: 'cat-1',
        page: 1,
        limit: 5,
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'product.categoryId = :categoryId',
        { categoryId: 'cat-1' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        '(product.name ILIKE :search OR product.sku ILIKE :search)',
        { search: '%manz%' },
      );
      expect(result.data[0].price).toBe(2.5);
      expect(result.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('devuelve el producto con su categoría y precios numéricos', async () => {
      productsRepository.findOne.mockResolvedValue({
        ...product,
        categoryId: 'cat-1',
        category: { id: 'cat-1', name: 'Frutas', slug: 'frutas' },
        price: '2.50',
        salePrice: '1.99',
      });

      const result = await service.findOne(product.id);

      expect(productsRepository.findOne).toHaveBeenCalledWith({
        where: { id: product.id },
        relations: { category: true },
      });
      expect(result.price).toBe(2.5);
      expect(result.salePrice).toBe(1.99);
      expect(result.category?.id).toBe('cat-1');
    });

    it('lanza NotFoundException si el producto no existe', async () => {
      productsRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('rechaza salePrice mayor o igual que price', async () => {
      await expect(
        service.create({
          sku: 'X',
          name: 'X',
          price: 5,
          salePrice: 7,
          unit: 'u',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza una categoría inexistente', async () => {
      categoriesRepository.exists.mockResolvedValue(false);

      await expect(
        service.create({
          sku: 'X',
          name: 'X',
          price: 5,
          unit: 'u',
          categoryId: 'cat-x',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('genera el slug y guarda el precio como string', async () => {
      // 1º: uniqueSlug (slug libre) · 2º: findOne tras el save (respuesta con relación)
      productsRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...product,
          id: 'new-id',
          sku: 'MANZ-002',
          name: 'Manzana Golden',
          slug: 'manzana-golden',
          price: '2.5',
        });
      let createdData: Partial<Product> | undefined;
      productsRepository.create.mockImplementation((data: Partial<Product>) => {
        createdData = data;
        return data;
      });
      productsRepository.save.mockImplementation((data: Partial<Product>) => ({
        id: 'new-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      }));

      const result = await service.create({
        sku: 'MANZ-002',
        name: 'Manzana Golden',
        price: 2.5,
        unit: 'kg',
      });

      expect(createdData?.slug).toBe('manzana-golden');
      expect(createdData?.price).toBe('2.5');
      expect(result.price).toBe(2.5);
    });

    it('convierte la violación de unicidad en ConflictException', async () => {
      productsRepository.findOne.mockResolvedValue(null);
      productsRepository.create.mockImplementation(
        (data: Partial<Product>) => data,
      );
      productsRepository.save.mockRejectedValue(
        new QueryFailedError('INSERT', [], { code: '23505' }),
      );

      await expect(
        service.create({
          sku: 'MANZ-002',
          name: 'Manzana',
          price: 2,
          unit: 'kg',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('limpia salePrice con null sin chocar con la validación', async () => {
      const existing = { ...product, price: '5.00', salePrice: '4.00' };
      productsRepository.findOne.mockResolvedValue(existing);
      productsRepository.save.mockImplementation((data: Product) => data);

      const result = await service.update(product.id, { salePrice: null });

      expect(result.salePrice).toBeNull();
    });

    it('valida el nuevo precio contra el salePrice vigente', async () => {
      const existing = { ...product, price: '5.00', salePrice: '4.00' };
      productsRepository.findOne.mockResolvedValue(existing);

      await expect(service.update(product.id, { price: 3 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza NotFoundException si el producto no existe', async () => {
      productsRepository.findOne.mockResolvedValue(null);

      await expect(service.update(product.id, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('lanza NotFoundException si el producto no existe', async () => {
      productsRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('x')).rejects.toThrow(NotFoundException);
    });
  });
});
