import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Address } from './address.entity';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

export interface AddressResponse {
  id: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateProvince: string | null;
  postalCode: string | null;
  deliveryNotes: string | null;
  isDefault: boolean;
  createdAt: Date;
}

function toResponse(row: Address): AddressResponse {
  return {
    id: row.id,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    stateProvince: row.stateProvince,
    postalCode: row.postalCode,
    deliveryNotes: row.deliveryNotes,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(Address)
    private readonly addressesRepository: Repository<Address>,
  ) {}

  /** Direcciones del usuario (la principal primero). */
  async findAll(userId: string): Promise<AddressResponse[]> {
    const rows = await this.addressesRepository.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });
    return rows.map(toResponse);
  }

  async findOne(userId: string, id: string): Promise<AddressResponse> {
    const row = await this.ensureOwned(userId, id);
    return toResponse(row);
  }

  async create(
    userId: string,
    dto: CreateAddressDto,
  ): Promise<AddressResponse> {
    const isFirst = !(await this.addressesRepository.exists({
      where: { userId },
    }));
    const shouldBeDefault = dto.isDefault === true || isFirst;

    if (shouldBeDefault) {
      // Solo una dirección principal por usuario
      await this.addressesRepository.update({ userId }, { isDefault: false });
    }

    const row = await this.addressesRepository.save(
      this.addressesRepository.create({
        userId,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2 ?? null,
        city: dto.city,
        stateProvince: dto.stateProvince ?? null,
        postalCode: dto.postalCode ?? null,
        deliveryNotes: dto.deliveryNotes ?? null,
        isDefault: shouldBeDefault,
      }),
    );
    return toResponse(row);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateAddressDto,
  ): Promise<AddressResponse> {
    const row = await this.ensureOwned(userId, id);

    if (dto.addressLine1 !== undefined) row.addressLine1 = dto.addressLine1;
    if (dto.addressLine2 !== undefined)
      row.addressLine2 = dto.addressLine2 ?? null;
    if (dto.city !== undefined) row.city = dto.city;
    if (dto.stateProvince !== undefined)
      row.stateProvince = dto.stateProvince ?? null;
    if (dto.postalCode !== undefined) row.postalCode = dto.postalCode ?? null;
    if (dto.deliveryNotes !== undefined)
      row.deliveryNotes = dto.deliveryNotes ?? null;

    if (dto.isDefault === true) {
      await this.addressesRepository.update({ userId }, { isDefault: false });
      row.isDefault = true;
    } else if (dto.isDefault === false && row.isDefault) {
      // Al desmarcar la principal, la más antigua de las RESTANTES la sucede
      // (se excluye la fila actual: si es la única, simplemente queda sin principal)
      const nextDefault = await this.addressesRepository.findOne({
        where: { userId, id: Not(row.id) },
        order: { createdAt: 'ASC' },
      });
      if (nextDefault) {
        nextDefault.isDefault = true;
        await this.addressesRepository.save(nextDefault);
      }
      row.isDefault = false;
    }

    await this.addressesRepository.save(row);
    return toResponse(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const row = await this.ensureOwned(userId, id);
    await this.addressesRepository.remove(row);

    // Si se borró la principal y quedan otras, la más antigua pasa a serlo
    if (row.isDefault) {
      const nextDefault = await this.addressesRepository.findOne({
        where: { userId },
        order: { createdAt: 'ASC' },
      });
      if (nextDefault) {
        nextDefault.isDefault = true;
        await this.addressesRepository.save(nextDefault);
      }
    }
  }

  /** Devuelve la dirección si existe y pertenece al usuario. */
  private async ensureOwned(userId: string, id: string): Promise<Address> {
    const row = await this.addressesRepository.findOne({
      where: { id, userId },
    });
    if (!row) {
      throw new NotFoundException('Dirección no encontrada');
    }
    return row;
  }
}
