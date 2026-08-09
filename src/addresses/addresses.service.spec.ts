import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Not } from 'typeorm';
import { Address } from './address.entity';
import { AddressesService } from './addresses.service';

describe('AddressesService', () => {
  let service: AddressesService;
  let addressesRepository: Record<string, jest.Mock>;

  const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const addressId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const makeAddress = (overrides: Partial<Address> = {}): Address =>
    ({
      id: addressId,
      userId,
      addressLine1: 'Av. Providencia 1234',
      addressLine2: null,
      city: 'Santiago',
      stateProvince: null,
      postalCode: null,
      deliveryNotes: null,
      isDefault: false,
      createdAt: new Date(),
      ...overrides,
    }) as unknown as Address;

  beforeEach(async () => {
    addressesRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      exists: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AddressesService,
        { provide: getRepositoryToken(Address), useValue: addressesRepository },
      ],
    }).compile();

    service = module.get(AddressesService);
  });

  describe('findAll', () => {
    it('devuelve las direcciones del usuario ordenadas (principal primero)', async () => {
      addressesRepository.find.mockResolvedValue([
        makeAddress({ isDefault: true }),
        makeAddress({ id: 'otra', isDefault: false }),
      ]);

      const result = await service.findAll(userId);

      expect(addressesRepository.find).toHaveBeenCalledWith({
        where: { userId },
        order: { isDefault: 'DESC', createdAt: 'ASC' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].isDefault).toBe(true);
    });
  });

  describe('create', () => {
    it('la primera dirección del usuario se vuelve la principal', async () => {
      addressesRepository.exists.mockResolvedValue(false);
      addressesRepository.create.mockImplementation(
        (data: Partial<Address>) => data,
      );
      addressesRepository.save.mockImplementation((data: Partial<Address>) =>
        Promise.resolve(makeAddress({ ...data })),
      );

      const result = await service.create(userId, {
        addressLine1: 'Av. Providencia 1234',
        city: 'Santiago',
      });

      expect(result.isDefault).toBe(true);
      // Desmarca las demás (no hay ninguna, pero el update se ejecuta igual)
      expect(addressesRepository.update).toHaveBeenCalledWith(
        { userId },
        { isDefault: false },
      );
    });

    it('al marcar isDefault desmarca las demás', async () => {
      addressesRepository.exists.mockResolvedValue(true);
      addressesRepository.create.mockImplementation(
        (data: Partial<Address>) => data,
      );
      addressesRepository.save.mockImplementation((data: Partial<Address>) =>
        Promise.resolve(makeAddress({ ...data })),
      );

      await service.create(userId, {
        addressLine1: 'Av. Los Leones 200',
        city: 'Santiago',
        isDefault: true,
      });

      expect(addressesRepository.update).toHaveBeenCalledWith(
        { userId },
        { isDefault: false },
      );
    });
  });

  describe('update', () => {
    it('lanza NotFoundException si la dirección no es del usuario', async () => {
      addressesRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update(userId, addressId, { city: 'Valparaíso' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('actualiza los campos enviados y desmarca las demás si pasa a ser principal', async () => {
      addressesRepository.findOne.mockResolvedValue(makeAddress());
      addressesRepository.save.mockImplementation((data: Partial<Address>) =>
        Promise.resolve(makeAddress({ ...data })),
      );

      const result = await service.update(userId, addressId, {
        city: 'Valparaíso',
        isDefault: true,
      });

      expect(addressesRepository.update).toHaveBeenCalledWith(
        { userId },
        { isDefault: false },
      );
      expect(result.city).toBe('Valparaíso');
      expect(result.isDefault).toBe(true);
    });

    it('al desmarcar la principal, la más antigua de las restantes la sucede', async () => {
      addressesRepository.findOne.mockResolvedValue(
        makeAddress({ isDefault: true }),
      );
      addressesRepository.findOne
        .mockResolvedValueOnce(makeAddress({ isDefault: true }))
        .mockResolvedValue(makeAddress({ id: 'otra', isDefault: false }));
      addressesRepository.save.mockImplementation((data: Partial<Address>) =>
        Promise.resolve(makeAddress({ ...data })),
      );

      await service.update(userId, addressId, { isDefault: false });

      // La promoción excluye la fila que se desmarca
      expect(addressesRepository.findOne).toHaveBeenLastCalledWith({
        where: { userId, id: Not(addressId) },
        order: { createdAt: 'ASC' },
      });
      expect(addressesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'otra', isDefault: true }),
      );
    });
  });

  describe('remove', () => {
    it('lanza NotFoundException si la dirección no es del usuario', async () => {
      addressesRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(userId, addressId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('elimina la dirección y promueve la más antigua si era la principal', async () => {
      addressesRepository.findOne.mockResolvedValue(
        makeAddress({ isDefault: true }),
      );
      addressesRepository.remove.mockResolvedValue(makeAddress());
      addressesRepository.findOne
        .mockResolvedValueOnce(makeAddress({ isDefault: true }))
        .mockResolvedValue(makeAddress({ id: 'otra', isDefault: false }));
      addressesRepository.save.mockImplementation((data: Partial<Address>) =>
        Promise.resolve(makeAddress({ ...data })),
      );

      await service.remove(userId, addressId);

      expect(addressesRepository.remove).toHaveBeenCalled();
      expect(addressesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'otra', isDefault: true }),
      );
    });
  });
});
