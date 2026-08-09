import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUniqueViolation } from '../common/db-errors';
import { computeStockStatus, StockStatus } from '../inventory/inventory.utils';
import { Product } from '../products/product.entity';
import { CartItem } from './cart-item.entity';
import { Cart } from './cart.entity';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

export interface CartProductInfo {
  id: string;
  sku: string;
  name: string;
  slug: string;
  price: number;
  salePrice: number | null;
  unit: string;
  imageUrl: string | null;
  inStock: boolean;
  stockStatus: StockStatus;
}

export interface CartItemResponse {
  productId: string;
  quantity: number;
  product: CartProductInfo | null;
  /** quantity × precio efectivo (salePrice si existe) */
  subtotal: number;
}

export interface CartResponse {
  id: string;
  items: CartItemResponse[];
  itemsCount: number;
  subtotal: number;
  createdAt: Date;
  updatedAt: Date;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

@Injectable()
export class CartsService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartsRepository: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemsRepository: Repository<CartItem>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
  ) {}

  /** Devuelve el carrito del usuario, creándolo si todavía no existe. */
  async getMyCart(userId: string): Promise<CartResponse> {
    const cart = await this.ensureCart(userId);
    const items = await this.cartItemsRepository.find({
      where: { cartId: cart.id },
      relations: { product: { inventory: true } },
      order: { createdAt: 'ASC' },
    });
    return this.toResponse(cart, items);
  }

  async addItem(userId: string, dto: AddCartItemDto): Promise<CartResponse> {
    const cart = await this.ensureCart(userId);
    await this.ensureProductPurchasable(dto.productId);

    let item = await this.cartItemsRepository.findOne({
      where: { cartId: cart.id, productId: dto.productId },
    });

    if (!item) {
      item = this.cartItemsRepository.create({
        cartId: cart.id,
        productId: dto.productId,
        quantity: '0',
      });
    }
    item.quantity = round(Number(item.quantity) + dto.quantity, 3).toString();

    try {
      await this.cartItemsRepository.save(item);
    } catch (error) {
      // Carrera TOCTOU: otro add concurrente creó el item → sumamos sobre el existente
      if (isUniqueViolation(error)) {
        const existing = await this.cartItemsRepository.findOne({
          where: { cartId: cart.id, productId: dto.productId },
        });
        if (!existing) {
          throw error;
        }
        existing.quantity = round(
          Number(existing.quantity) + dto.quantity,
          3,
        ).toString();
        await this.cartItemsRepository.save(existing);
      } else {
        throw error;
      }
    }

    return this.getMyCart(userId);
  }

  async updateItem(
    userId: string,
    productId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartResponse> {
    const cart = await this.ensureCart(userId);
    const item = await this.cartItemsRepository.findOne({
      where: { cartId: cart.id, productId },
    });
    if (!item) {
      throw new NotFoundException('El producto no está en el carrito');
    }
    item.quantity = round(dto.quantity, 3).toString();
    await this.cartItemsRepository.save(item);
    return this.getMyCart(userId);
  }

  async removeItem(userId: string, productId: string): Promise<void> {
    const cart = await this.ensureCart(userId);
    const item = await this.cartItemsRepository.findOne({
      where: { cartId: cart.id, productId },
    });
    if (!item) {
      throw new NotFoundException('El producto no está en el carrito');
    }
    await this.cartItemsRepository.remove(item);
  }

  async clearCart(userId: string): Promise<void> {
    const cart = await this.ensureCart(userId);
    await this.cartItemsRepository.delete({ cartId: cart.id });
  }

  private async ensureCart(userId: string): Promise<Cart> {
    let cart = await this.cartsRepository.findOne({ where: { userId } });
    if (!cart) {
      cart = await this.cartsRepository.save(
        this.cartsRepository.create({ userId }),
      );
    }
    return cart;
  }

  private async ensureProductPurchasable(productId: string): Promise<void> {
    const product = await this.productsRepository.findOne({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }
    if (!product.isActive) {
      throw new BadRequestException('El producto no está disponible');
    }
  }

  private toResponse(cart: Cart, items: CartItem[]): CartResponse {
    const mapped = items.map((item): CartItemResponse => {
      const product = item.product;
      const price = product
        ? product.salePrice !== null
          ? Number(product.salePrice)
          : Number(product.price)
        : 0;
      const quantity = Number(item.quantity);
      const stockQuantity = product?.inventory
        ? Number(product.inventory.stockQuantity)
        : 0;
      const minStockLevel = product?.inventory
        ? Number(product.inventory.minStockLevel)
        : 0;

      return {
        productId: item.productId,
        quantity,
        product: product
          ? {
              id: product.id,
              sku: product.sku,
              name: product.name,
              slug: product.slug,
              price: Number(product.price),
              salePrice:
                product.salePrice === null ? null : Number(product.salePrice),
              unit: product.unit,
              imageUrl: product.imageUrl,
              inStock: stockQuantity > 0,
              stockStatus: computeStockStatus(stockQuantity, minStockLevel),
            }
          : null,
        subtotal: round(price * quantity, 2),
      };
    });

    return {
      id: cart.id,
      items: mapped,
      itemsCount: mapped.length,
      subtotal: round(
        mapped.reduce((acc, item) => acc + item.subtotal, 0),
        2,
      ),
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
    };
  }
}
