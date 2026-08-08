import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUniqueViolation } from '../common/db-errors';
import {
  buildPaginated,
  getPaginationOptions,
  Paginated,
} from '../common/pagination';
import { slugify } from '../common/slugify';
import { Category } from './category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ListCategoriesDto } from './dto/list-categories.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

export interface CategoryResponse {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  isActive: boolean;
  createdAt: Date;
}

function toResponse(category: Category): CategoryResponse {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    parentId: category.parentId,
    isActive: category.isActive,
    createdAt: category.createdAt,
  };
}

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
  ) {}

  async findAll(
    query: ListCategoriesDto,
  ): Promise<Paginated<CategoryResponse>> {
    const { skip, take, page, limit } = getPaginationOptions(
      query.page,
      query.limit,
    );

    const qb = this.categoriesRepository.createQueryBuilder('category');
    if (query.parentId !== undefined) {
      qb.andWhere('category.parentId = :parentId', {
        parentId: query.parentId,
      });
    }
    if (query.active !== undefined) {
      qb.andWhere('category.isActive = :active', {
        active: query.active === 'true',
      });
    }

    const [categories, total] = await qb
      .orderBy('category.name', 'ASC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return buildPaginated(categories.map(toResponse), total, page, limit);
  }

  async findOne(id: string): Promise<CategoryResponse> {
    const category = await this.categoriesRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }
    return toResponse(category);
  }

  async create(dto: CreateCategoryDto): Promise<CategoryResponse> {
    if (dto.parentId) {
      await this.ensureCategoryExists(dto.parentId);
    }

    const slug = dto.slug ?? (await this.uniqueSlug(slugify(dto.name)));

    const category = this.categoriesRepository.create({
      name: dto.name,
      slug,
      description: dto.description ?? null,
      parentId: dto.parentId ?? null,
      isActive: dto.isActive ?? true,
    });

    try {
      const saved = await this.categoriesRepository.save(category);
      return toResponse(saved);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Ya existe una categoría con este slug');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryResponse> {
    const category = await this.categoriesRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }

    if (dto.parentId && dto.parentId !== id) {
      await this.ensureCategoryExists(dto.parentId);
    }

    let slug = category.slug;
    if (dto.slug) {
      slug = await this.uniqueSlug(dto.slug, id);
    } else if (dto.name && dto.name !== category.name) {
      slug = await this.uniqueSlug(slugify(dto.name), id);
    }

    category.name = dto.name ?? category.name;
    category.slug = slug;
    // !== undefined permite limpiar (enviar null) los campos nulleables
    if (dto.description !== undefined) {
      category.description = dto.description;
    }
    if (dto.parentId !== undefined) {
      category.parentId = dto.parentId;
    }
    category.isActive = dto.isActive ?? category.isActive;

    try {
      const saved = await this.categoriesRepository.save(category);
      return toResponse(saved);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Ya existe una categoría con este slug');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const category = await this.categoriesRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }
    // El esquema define ON DELETE SET NULL para products.category_id y
    // categories.parent_id, así que la BD mantiene la integridad.
    await this.categoriesRepository.remove(category);
  }

  private async ensureCategoryExists(id: string): Promise<void> {
    const exists = await this.categoriesRepository.exists({ where: { id } });
    if (!exists) {
      throw new BadRequestException('La categoría padre no existe');
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
      const existing = await this.categoriesRepository.findOne({
        where: { slug },
      });
      if (!existing || existing.id === excludeId) {
        return slug;
      }
      slug = `${base}-${counter++}`;
    }
  }
}
