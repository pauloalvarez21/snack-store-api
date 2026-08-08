import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { Paginated } from '../common/pagination';
import { UserRole } from '../users/user.entity';
import type { CategoryResponse } from './categories.service';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ListCategoriesDto } from './dto/list-categories.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar categorías (público, paginado)' })
  findAll(
    @Query() query: ListCategoriesDto,
  ): Promise<Paginated<CategoryResponse>> {
    return this.categoriesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una categoría por id' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CategoryResponse> {
    return this.categoriesService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Crear categoría (solo ADMIN)' })
  create(@Body() dto: CreateCategoryDto): Promise<CategoryResponse> {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Actualizar categoría (solo ADMIN)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponse> {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Eliminar categoría (solo ADMIN)' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.categoriesService.remove(id);
  }
}
