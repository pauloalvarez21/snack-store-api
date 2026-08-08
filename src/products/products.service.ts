import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../categories/category.entity';
import { isUniqueViolation } from '../common/db-errors';
import {
  buildPaginated,
  getPaginationOptions,
  Paginated,
} from '../common/pagination';
import { slugify } from '../common/slugify';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './product.entity';

export interface ProductResponse {
  id: string;
  categoryId: string | null;
  category: { id: string; name: string; slug: string } | null;
  sku: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  salePrice: number | null;
  unit: string;
  isPerishable: boolean;
  isOrganic: boolean;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toResponse(product: Product): ProductResponse {
  return {
    id: product.id,
    categoryId: product.categoryId,
    category: product.category
      ? {
          id: product.category.id,
          name: product.category.name,
          slug: product.category.slug,
        }
      : null,
    sku: product.sku,
    name: product.name,
    slug: product.slug,
    description: product.description,
    price: Number(product.price),
    salePrice: product.salePrice === null ? null : Number(product.salePrice),
    unit: product.unit,
    isPerishable: product.isPerishable,
    isOrganic: product.isOrganic,
    imageUrl: product.imageUrl,
    isActive: product.isActive,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
  ) {}

  async findAll(query: ListProductsDto): Promise<Paginated<ProductResponse>> {
    const { skip, take, page, limit } = getPaginationOptions(
      query.page,
      query.limit,
    );

    const qb = this.productsRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category');

    if (query.categoryId !== undefined) {
      qb.andWhere('product.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    if (query.active !== undefined) {
      qb.andWhere('product.isActive = :active', {
        active: query.active === 'true',
      });
    }
    if (query.search !== undefined) {
      qb.andWhere('(product.name ILIKE :search OR product.sku ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    const [products, total] = await qb
      .orderBy('product.name', 'ASC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return buildPaginated(products.map(toResponse), total, page, limit);
  }

  async findOne(id: string): Promise<ProductResponse> {
    const product = await this.productsRepository.findOne({
      where: { id },
      relations: { category: true },
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }
    return toResponse(product);
  }

  async create(dto: CreateProductDto): Promise<ProductResponse> {
    if (dto.categoryId) {
      await this.ensureCategoryExists(dto.categoryId);
    }
    this.validatePrices(dto.price, dto.salePrice);

    const slug = dto.slug ?? (await this.uniqueSlug(slugify(dto.name)));

    const product = this.productsRepository.create({
      categoryId: dto.categoryId ?? null,
      sku: dto.sku,
      name: dto.name,
      slug,
      description: dto.description ?? null,
      price: dto.price.toString(),
      salePrice: dto.salePrice?.toString() ?? null,
      unit: dto.unit,
      isPerishable: dto.isPerishable ?? false,
      isOrganic: dto.isOrganic ?? false,
      imageUrl: dto.imageUrl ?? null,
      isActive: dto.isActive ?? true,
    });

    try {
      const saved = await this.productsRepository.save(product);
      // save() no carga la relación: devolvemos el registro fresco con su categoría
      return this.findOne(saved.id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Ya existe un producto con este SKU o slug',
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductResponse> {
    const product = await this.productsRepository.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    if (dto.categoryId !== undefined) {
      if (dto.categoryId !== null && dto.categoryId !== product.categoryId) {
        await this.ensureCategoryExists(dto.categoryId);
      }
      product.categoryId = dto.categoryId;
    }

    const newPrice = dto.price ?? Number(product.price);
    // salePrice: null limpia el campo; usamos el valor efectivo para validar
    const newSalePrice =
      dto.salePrice === undefined
        ? product.salePrice
          ? Number(product.salePrice)
          : null
        : dto.salePrice;
    this.validatePrices(
      newPrice,
      newSalePrice === null ? undefined : newSalePrice,
    );

    let slug = product.slug;
    if (dto.slug) {
      slug = await this.uniqueSlug(dto.slug, id);
    } else if (dto.name && dto.name !== product.name) {
      slug = await this.uniqueSlug(slugify(dto.name), id);
    }
    product.sku = dto.sku ?? product.sku;
    product.name = dto.name ?? product.name;
    product.slug = slug;
    if (dto.description !== undefined) {
      product.description = dto.description;
    }
    product.price = newPrice.toString();
    if (dto.salePrice !== undefined) {
      product.salePrice =
        dto.salePrice === null ? null : dto.salePrice.toString();
    }
    product.unit = dto.unit ?? product.unit;
    product.isPerishable = dto.isPerishable ?? product.isPerishable;
    product.isOrganic = dto.isOrganic ?? product.isOrganic;
    if (dto.imageUrl !== undefined) {
      product.imageUrl = dto.imageUrl;
    }
    product.isActive = dto.isActive ?? product.isActive;

    try {
      const saved = await this.productsRepository.save(product);
      // save() no carga la relación: devolvemos el registro fresco con su categoría
      return this.findOne(saved.id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Ya existe un producto con este SKU o slug',
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const product = await this.productsRepository.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }
    await this.productsRepository.remove(product);
  }

  private validatePrices(price: number, salePrice?: number): void {
    if (salePrice !== undefined && salePrice >= price) {
      throw new BadRequestException('salePrice debe ser menor que price');
    }
  }

  private async ensureCategoryExists(id: string): Promise<void> {
    const exists = await this.categoriesRepository.exists({ where: { id } });
    if (!exists) {
      throw new BadRequestException('La categoría no existe');
    }
  }

  private async uniqueSlug(base: string, excludeId?: string): Promise<string> {
    if (!base) {
      throw new BadRequestException(
        'No se pudo generar un slug a partir del nombre',
      );
    }
    let slug = base;
    let counter = 2;
    for (;;) {
      const existing = await this.productsRepository.findOne({
        where: { slug },
      });
      if (!existing || existing.id === excludeId) {
        return slug;
      }
      slug = `${base}-${counter++}`;
    }
  }
}
