import {
  Body,
  Controller,
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
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { ListInventoryDto } from './dto/list-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import type { InventoryResponse } from './inventory.service';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth('JWT-auth')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar inventario con producto (paginado, solo ADMIN)',
  })
  findAll(
    @Query() query: ListInventoryDto,
  ): Promise<Paginated<InventoryResponse>> {
    return this.inventoryService.findAll(query);
  }

  @Get(':productId')
  @ApiOperation({ summary: 'Ver inventario de un producto (solo ADMIN)' })
  findOne(
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<InventoryResponse> {
    return this.inventoryService.findOneByProduct(productId);
  }

  @Patch(':productId')
  @ApiOperation({
    summary: 'Fijar stock de un producto (crea el registro si no existe)',
  })
  update(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateInventoryDto,
  ): Promise<InventoryResponse> {
    return this.inventoryService.update(productId, dto);
  }

  @Post(':productId/adjust')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ajustar stock por delta (suma o resta; no puede quedar negativo)',
  })
  adjust(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: AdjustInventoryDto,
  ): Promise<InventoryResponse> {
    return this.inventoryService.adjust(productId, dto);
  }
}
