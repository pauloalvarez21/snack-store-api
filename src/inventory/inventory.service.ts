import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  buildPaginated,
  getPaginationOptions,
  Paginated,
} from '../common/pagination';
import { Product } from '../products/product.entity';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { ListInventoryDto } from './dto/list-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { Inventory } from './inventory.entity';
import { computeStockStatus, StockStatus } from './inventory.utils';

export interface InventoryResponse {
  id: string;
  productId: string;
  product: { id: string; sku: string; name: string; slug: string } | null;
  stockQuantity: number;
  minStockLevel: number;
  stockStatus: StockStatus;
  expirationDate: string | null;
  updatedAt: Date;
}

function toResponse(row: Inventory): InventoryResponse {
  const stockQuantity = Number(row.stockQuantity);
  const minStockLevel = Number(row.minStockLevel);
  return {
    id: row.id,
    productId: row.productId,
    product: row.product
      ? {
          id: row.product.id,
          sku: row.product.sku,
          name: row.product.name,
          slug: row.product.slug,
        }
      : null,
    stockQuantity,
    minStockLevel,
    stockStatus: computeStockStatus(stockQuantity, minStockLevel),
    expirationDate: row.expirationDate,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
  ) {}

  async findAll(
    query: ListInventoryDto,
  ): Promise<Paginated<InventoryResponse>> {
    const { skip, take, page, limit } = getPaginationOptions(
      query.page,
      query.limit,
    );

    const qb = this.inventoryRepository
      .createQueryBuilder('inventory')
      .leftJoinAndSelect('inventory.product', 'product');

    if (query.search !== undefined) {
      qb.andWhere('(product.name ILIKE :search OR product.sku ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    const [rows, total] = await qb
      .orderBy('product.name', 'ASC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return buildPaginated(rows.map(toResponse), total, page, limit);
  }

  async findOneByProduct(productId: string): Promise<InventoryResponse> {
    const row = await this.inventoryRepository.findOne({
      where: { productId },
      relations: { product: true },
    });
    if (!row) {
      throw new NotFoundException(
        'Inventario no encontrado para este producto',
      );
    }
    return toResponse(row);
  }

  async update(
    productId: string,
    dto: UpdateInventoryDto,
  ): Promise<InventoryResponse> {
    await this.ensureProductExists(productId);

    let row = await this.inventoryRepository.findOne({ where: { productId } });
    if (!row) {
      // Mismos defaults que el esquema: evita Number(undefined) → NaN
      row = this.inventoryRepository.create({
        productId,
        stockQuantity: '0',
        minStockLevel: '5',
      });
    }

    if (dto.stockQuantity !== undefined) {
      row.stockQuantity = dto.stockQuantity.toString();
    }
    if (dto.minStockLevel !== undefined) {
      row.minStockLevel = dto.minStockLevel.toString();
    }
    if (dto.expirationDate !== undefined) {
      row.expirationDate = dto.expirationDate;
    }

    await this.inventoryRepository.save(row);
    return this.findOneByProduct(productId);
  }

  async adjust(
    productId: string,
    dto: AdjustInventoryDto,
  ): Promise<InventoryResponse> {
    await this.ensureProductExists(productId);

    let row = await this.inventoryRepository.findOne({ where: { productId } });
    if (!row) {
      // Mismos defaults que el esquema: evita Number(undefined) → NaN
      row = this.inventoryRepository.create({
        productId,
        stockQuantity: '0',
        minStockLevel: '5',
      });
    }

    const next = Number(row.stockQuantity) + dto.quantity;
    if (next < 0) {
      throw new BadRequestException('El stock no puede quedar negativo');
    }
    row.stockQuantity = next.toString();

    await this.inventoryRepository.save(row);
    return this.findOneByProduct(productId);
  }

  private async ensureProductExists(productId: string): Promise<void> {
    const exists = await this.productsRepository.exists({
      where: { id: productId },
    });
    if (!exists) {
      throw new NotFoundException('Producto no encontrado');
    }
  }
}
