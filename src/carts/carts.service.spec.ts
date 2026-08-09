import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Product } from '../products/product.entity';
import { CartItem } from './cart-item.entity';
import { Cart } from './cart.entity';
import { CartsService } from './carts.service';

describe('CartsService', () => {
  let service: CartsService;
  let cartsRepository: Record<string, jest.Mock>;
  let cartItemsRepository: Record<string, jest.Mock>;
  let productsRepository: Record<string, jest.Mock>;

  const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const cartId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const productId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  const makeCart = (): Cart => ({
    id: cartId,
    userId,
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const makeProduct = (overrides: Partial<Product> = {}): Product =>
    ({
      id: productId,
      categoryId: null,
      category: null,
      inventory: { stockQuantity: '10', minStockLevel: '5' },
      sku: 'MANZ-001',
      name: 'Manzana',
      slug: 'manzana',
      description: null,
      price: '2.50',
      salePrice: '1.99',
      unit: 'kg',
      isPerishable: false,
      isOrganic: false,
      imageUrl: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as unknown as Product;

  const makeItem = (
    quantity = '2',
    product: Product = makeProduct(),
  ): CartItem => ({
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    cartId,
    productId,
    quantity,
    createdAt: new Date(),
    cart: makeCart(),
    product,
  });

  beforeEach(async () => {
    cartsRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    cartItemsRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      delete: jest.fn(),
    };
    productsRepository = { findOne: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        CartsService,
        { provide: getRepositoryToken(Cart), useValue: cartsRepository },
        {
          provide: getRepositoryToken(CartItem),
          useValue: cartItemsRepository,
        },
        { provide: getRepositoryToken(Product), useValue: productsRepository },
      ],
    }).compile();

    service = module.get(CartsService);
  });

  describe('getMyCart', () => {
    it('crea el carrito si no existe y calcula subtotales con el precio efectivo', async () => {
      const cart = makeCart();
      cartsRepository.findOne.mockResolvedValue(null);
      cartsRepository.create.mockImplementation((data: Partial<Cart>) => data);
      cartsRepository.save.mockResolvedValue(cart);
      cartItemsRepository.find.mockResolvedValue([makeItem('2')]);

      const result = await service.getMyCart(userId);

      expect(cartsRepository.create).toHaveBeenCalledWith({ userId });
      expect(result.id).toBe(cartId);
      expect(result.itemsCount).toBe(1);
      expect(result.items[0].subtotal).toBe(3.98); // 2 × 1.99 (salePrice)
      expect(result.subtotal).toBe(3.98);
      expect(result.items[0].product?.inStock).toBe(true);
      expect(result.items[0].product?.stockStatus).toBe('IN_STOCK');
    });
  });

  describe('addItem', () => {
    it('suma la cantidad si el producto ya está en el carrito', async () => {
      cartsRepository.findOne.mockResolvedValue(makeCart());
      productsRepository.findOne.mockResolvedValue(makeProduct());
      const item = makeItem('2');
      cartItemsRepository.findOne.mockResolvedValue(item);
      cartItemsRepository.save.mockImplementation(
        (data: Partial<CartItem>) => data,
      );
      cartItemsRepository.find.mockResolvedValue([item]);

      const result = await service.addItem(userId, { productId, quantity: 1 });

      expect(item.quantity).toBe('3');
      expect(result.items[0].quantity).toBe(3);
    });

    it('lanza NotFoundException si el producto no existe', async () => {
      cartsRepository.findOne.mockResolvedValue(makeCart());
      productsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.addItem(userId, { productId, quantity: 1 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException si el producto está inactivo', async () => {
      cartsRepository.findOne.mockResolvedValue(makeCart());
      productsRepository.findOne.mockResolvedValue(
        makeProduct({ isActive: false }),
      );

      await expect(
        service.addItem(userId, { productId, quantity: 1 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateItem', () => {
    it('fija la cantidad del item', async () => {
      cartsRepository.findOne.mockResolvedValue(makeCart());
      const item = makeItem('2');
      cartItemsRepository.findOne.mockResolvedValue(item);
      cartItemsRepository.save.mockImplementation(
        (data: Partial<CartItem>) => data,
      );
      cartItemsRepository.find.mockResolvedValue([item]);

      const result = await service.updateItem(userId, productId, {
        quantity: 5,
      });

      expect(item.quantity).toBe('5');
      expect(result.items[0].quantity).toBe(5);
    });

    it('lanza NotFoundException si el producto no está en el carrito', async () => {
      cartsRepository.findOne.mockResolvedValue(makeCart());
      cartItemsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateItem(userId, productId, { quantity: 1 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeItem', () => {
    it('quita el item del carrito', async () => {
      cartsRepository.findOne.mockResolvedValue(makeCart());
      const item = makeItem();
      cartItemsRepository.findOne.mockResolvedValue(item);
      cartItemsRepository.remove.mockResolvedValue(item);

      await service.removeItem(userId, productId);

      expect(cartItemsRepository.remove).toHaveBeenCalledWith(item);
    });

    it('lanza NotFoundException si no está en el carrito', async () => {
      cartsRepository.findOne.mockResolvedValue(makeCart());
      cartItemsRepository.findOne.mockResolvedValue(null);

      await expect(service.removeItem(userId, productId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('clearCart', () => {
    it('elimina todos los items del carrito', async () => {
      cartsRepository.findOne.mockResolvedValue(makeCart());

      await service.clearCart(userId);

      expect(cartItemsRepository.delete).toHaveBeenCalledWith({ cartId });
    });
  });
});
