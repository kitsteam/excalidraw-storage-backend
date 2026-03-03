import { Test, TestingModule } from '@nestjs/testing';
import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ScenesController } from './scenes.controller';
import { StorageService, StorageNamespace } from '../storage/storage.service';
import { createMockStorageService } from '../../test/mocks/storage.mock';

describe('ScenesController', () => {
  let controller: ScenesController;
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
      controllers: [ScenesController],
    }).compile();

    controller = module.get<ScenesController>(ScenesController);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    if (module) {
      await module.close();
    }
  });

  describe('findOne', () => {
    it('should pipe stored data to the response', async () => {
      const sceneData = Buffer.from('scene-binary-data');
      mockStorageService.get.mockResolvedValue(sceneData);

      const mockRes = {
        write: jest.fn(() => true),
        end: jest.fn(),
        on: jest.fn(),
        once: jest.fn(),
        emit: jest.fn(),
      };

      await controller.findOne({ id: 'scene-123' }, mockRes as any);
      await new Promise((r) => setImmediate(r));

      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should throw NotFoundException when scene does not exist', async () => {
      mockStorageService.get.mockResolvedValue(undefined);

      const mockRes = { on: jest.fn(), once: jest.fn(), emit: jest.fn() };

      await expect(
        controller.findOne({ id: 'missing-scene' }, mockRes as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should store the scene and return a numeric id', async () => {
      mockStorageService.get.mockResolvedValue(undefined);

      const result = await controller.create(Buffer.from('scene-data'));

      expect(result.id).toMatch(/^\d{16}$/);
    });

    it('should call storage.set with SCENES namespace', async () => {
      mockStorageService.get.mockResolvedValue(undefined);

      await controller.create(Buffer.from('scene-data'));

      expect(mockStorageService.set).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{16}$/),
        expect.any(Buffer),
        StorageNamespace.SCENES,
      );
    });

    it('should throw InternalServerErrorException on id collision', async () => {
      mockStorageService.get.mockResolvedValue(Buffer.from('existing'));

      await expect(
        controller.create(Buffer.from('scene-data')),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
