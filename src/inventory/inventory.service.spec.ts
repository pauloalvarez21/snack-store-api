import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Product } from '../products/product.entity';
import { Inventory } from './inventory.entity';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  let service: InventoryService;
  let inventoryRepository: Record<string, jest.Mock>;
  let productsRepository: Record<string, jest.Mock>;
  let inventoryRow: Inventory;

  const productId = '22222222-2222-2222-2222-222222222222';

  const makeRow = (): Inventory => ({
    id: '33333333-3333-3333-3333-333333333333',
    productId,
    product: {
      id: productId,
      sku: 'MANZ-001',
      name: 'Manzana',
      slug: 'manzana',
    } as unknown as Product,
    stockQuantity: '10',
    minStockLevel: '5',
    expirationDate: null,
    updatedAt: new Date(),
  });

  beforeEach(async () => {
    // Fila fresca por test: los ajustes mutan el objeto y no deben filtrarse
    inventoryRow = makeRow();
    inventoryRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    productsRepository = { exists: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        InventoryService,
        {
          provide: getRepositoryToken(Inventory),
          useValue: inventoryRepository,
        },
        {
          provide: getRepositoryToken(Product),
          useValue: productsRepository,
        },
      ],
    }).compile();

    service = module.get(InventoryService);
  });

  describe('findAll', () => {
    it('devuelve el inventario paginado con producto y estado derivado', async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[inventoryRow], 1]),
      };
      inventoryRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data[0].stockQuantity).toBe(10);
      expect(result.data[0].minStockLevel).toBe(5);
      expect(result.data[0].stockStatus).toBe('IN_STOCK');
      expect(result.data[0].product?.sku).toBe('MANZ-001');
      expect(result.total).toBe(1);
    });
  });

  describe('findOneByProduct', () => {
    it('lanza NotFoundException si no hay inventario para el producto', async () => {
      inventoryRepository.findOne.mockResolvedValue(null);

      await expect(service.findOneByProduct(productId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('devuelve el registro con estado derivado', async () => {
      inventoryRepository.findOne.mockResolvedValue(inventoryRow);

      const result = await service.findOneByProduct(productId);

      expect(result.stockStatus).toBe('IN_STOCK');
      expect(result.productId).toBe(productId);
    });
  });

  describe('update', () => {
    it('crea el registro si no existe (upsert) y fija el stock', async () => {
      productsRepository.exists.mockResolvedValue(true);
      inventoryRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(inventoryRow);
      // Copia: las mutaciones posteriores no deben alterar la llamada a create
      inventoryRepository.create.mockImplementation(
        (data: Partial<Inventory>) => ({ ...data }),
      );
      inventoryRepository.save.mockImplementation(
        (data: Partial<Inventory>) => data,
      );

      const result = await service.update(productId, { stockQuantity: 25 });

      expect(inventoryRepository.create).toHaveBeenCalledWith({
        productId,
        stockQuantity: '0',
        minStockLevel: '5',
      });
      expect(result.stockQuantity).toBe(10); // findOneByProduct devuelve el fixture
    });

    it('lanza NotFoundException si el producto no existe', async () => {
      productsRepository.exists.mockResolvedValue(false);

      await expect(
        service.update(productId, { stockQuantity: 1 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('adjust', () => {
    it('suma o resta el delta sobre el stock actual', async () => {
      productsRepository.exists.mockResolvedValue(true);
      inventoryRepository.findOne.mockResolvedValue(inventoryRow);
      inventoryRepository.save.mockImplementation(
        (data: Partial<Inventory>) => data,
      );

      const result = await service.adjust(productId, { quantity: -3 });

      expect(result.stockQuantity).toBe(7);
    });

    it('lanza BadRequestException si el total quedaría negativo', async () => {
      productsRepository.exists.mockResolvedValue(true);
      inventoryRepository.findOne.mockResolvedValue(inventoryRow);

      await expect(
        service.adjust(productId, { quantity: -15 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea el registro desde 0 si no existe', async () => {
      productsRepository.exists.mockResolvedValue(true);
      inventoryRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(inventoryRow);
      // Copia: las mutaciones posteriores no deben alterar la llamada a create
      inventoryRepository.create.mockImplementation(
        (data: Partial<Inventory>) => ({ ...data }),
      );
      inventoryRepository.save.mockImplementation(
        (data: Partial<Inventory>) => data,
      );

      const result = await service.adjust(productId, { quantity: 5 });

      expect(inventoryRepository.create).toHaveBeenCalledWith({
        productId,
        stockQuantity: '0',
        minStockLevel: '5',
      });
      expect(result.stockQuantity).toBe(10); // fixture tras el save
    });
  });
});
