import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FilesController } from './files.controller';
import { StorageService, StorageNamespace } from '../storage/storage.service';
import { createMockStorageService } from '../../test/mocks/storage.mock';

describe('FilesController', () => {
  let controller: FilesController;
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
      controllers: [FilesController],
    }).compile();

    controller = module.get<FilesController>(FilesController);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    if (module) {
      await module.close();
    }
  });

  describe('findOne', () => {
    it('should pipe stored data to the response', async () => {
      const fileData = Buffer.from('binary-file-data');
      mockStorageService.get.mockResolvedValue(fileData);

      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn(() => true),
        end: jest.fn(),
        on: jest.fn(),
        once: jest.fn(),
        emit: jest.fn(),
      };

      await controller.findOne({ id: 'file-123' }, mockRes as any);
      await new Promise((r) => setImmediate(r));

      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should set Content-Length header matching data size', async () => {
      const fileData = Buffer.from('binary-file-data');
      mockStorageService.get.mockResolvedValue(fileData);

      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn(() => true),
        end: jest.fn(),
        on: jest.fn(),
        once: jest.fn(),
        emit: jest.fn(),
      };

      await controller.findOne({ id: 'file-123' }, mockRes as any);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Length',
        fileData.length,
      );
    });

    it('should throw NotFoundException when file does not exist', async () => {
      mockStorageService.get.mockResolvedValue(undefined);

      const mockRes = { on: jest.fn(), once: jest.fn(), emit: jest.fn() };

      await expect(
        controller.findOne({ id: 'missing-file' }, mockRes as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should store the file and return the id', async () => {
      const payload = Buffer.from('new-file-data');

      const result = await controller.create({ id: 'file-456' }, payload);

      expect(result).toEqual({ id: 'file-456' });
    });

    it('should call storage.set with the correct namespace', async () => {
      const payload = Buffer.from('new-file-data');

      await controller.create({ id: 'file-456' }, payload);

      expect(mockStorageService.set).toHaveBeenCalledWith(
        'file-456',
        payload,
        StorageNamespace.FILES,
      );
    });
  });

  describe('touch', () => {
    it('should return id and updatedAt when file exists', async () => {
      mockStorageService.touch.mockResolvedValue(true);

      const result = await controller.touch('file-789');

      expect(result).toEqual({
        id: 'file-789',
        updatedAt: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
        ),
      });
    });

    it('should throw NotFoundException when file does not exist', async () => {
      mockStorageService.touch.mockResolvedValue(false);

      await expect(controller.touch('missing-file')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
