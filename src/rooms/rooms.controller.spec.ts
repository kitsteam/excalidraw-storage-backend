import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { StorageService, StorageNamespace } from '../storage/storage.service';
import { createMockStorageService } from '../../test/mocks/storage.mock';

describe('RoomsController', () => {
  let controller: RoomsController;
  let module: TestingModule;
  let mockStorageService: ReturnType<typeof createMockStorageService>;

  beforeEach(async () => {
    mockStorageService = createMockStorageService();
    module = await Test.createTestingModule({
      providers: [
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
      ],
      controllers: [RoomsController],
    }).compile();

    controller = module.get<RoomsController>(RoomsController);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    if (module) {
      await module.close();
    }
  });

  describe('findOne', () => {
    it('should pipe stored data to the response', async () => {
      const roomData = Buffer.from('room-binary-data');
      mockStorageService.get.mockResolvedValue(roomData);

      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn(() => true),
        end: jest.fn(),
        on: jest.fn(),
        once: jest.fn(),
        emit: jest.fn(),
      };

      await controller.findOne({ id: 'room-123' }, mockRes as any);
      await new Promise((r) => setImmediate(r));

      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should set Content-Length header matching data size', async () => {
      const roomData = Buffer.from('room-binary-data');
      mockStorageService.get.mockResolvedValue(roomData);

      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn(() => true),
        end: jest.fn(),
        on: jest.fn(),
        once: jest.fn(),
        emit: jest.fn(),
      };

      await controller.findOne({ id: 'room-123' }, mockRes as any);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Length',
        roomData.length,
      );
    });

    it('should throw NotFoundException when room does not exist', async () => {
      mockStorageService.get.mockResolvedValue(undefined);

      const mockRes = { on: jest.fn(), once: jest.fn(), emit: jest.fn() };

      await expect(
        controller.findOne({ id: 'missing-room' }, mockRes as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should store the room and return the id', async () => {
      const payload = Buffer.from('new-room-data');

      const result = await controller.create({ id: 'room-456' }, payload);

      expect(result).toEqual({ id: 'room-456' });
    });

    it('should call storage.set with the correct namespace', async () => {
      const payload = Buffer.from('new-room-data');

      await controller.create({ id: 'room-456' }, payload);

      expect(mockStorageService.set).toHaveBeenCalledWith(
        'room-456',
        payload,
        StorageNamespace.ROOMS,
      );
    });
  });
});
