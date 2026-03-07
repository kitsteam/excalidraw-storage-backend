import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  FilesController,
  ValidateIdParam,
  ValidatePrefixParam,
} from './files.controller';
import { StorageService, StorageNamespace } from '../storage/storage.service';
import { createMockStorageService } from '../../test/mocks/storage.mock';
import { Response } from 'express';

type MockStorageService = ReturnType<typeof createMockStorageService>;

interface MockResponse {
  setHeader: jest.Mock;
  write: jest.Mock;
  end: jest.Mock;
  on: jest.Mock;
  once: jest.Mock;
  emit: jest.Mock;
}

const createMockResponse = (): MockResponse => ({
  setHeader: jest.fn(),
  write: jest.fn(() => true),
  end: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  emit: jest.fn(),
});

describe('FilesController', () => {
  let controller: FilesController;
  let module: TestingModule;
  let mockStorageService: MockStorageService;

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

  // --- Legacy GET ---

  describe('findOne', () => {
    let mockRes: MockResponse;

    beforeEach(() => {
      mockRes = createMockResponse();
    });

    it('should stream file data to the response', async () => {
      mockStorageService.get.mockResolvedValue(Buffer.from('file-data'));

      await controller.findOne('file-123', mockRes as unknown as Response);
      await new Promise((r) => setImmediate(r));

      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should set Content-Length header to match data size', async () => {
      const fileData = Buffer.from('binary-file-data');
      mockStorageService.get.mockResolvedValue(fileData);

      await controller.findOne('file-123', mockRes as unknown as Response);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', 16);
    });

    it('should look up using the flat key', async () => {
      mockStorageService.get.mockResolvedValue(Buffer.from('data'));

      await controller.findOne('file-123', mockRes as unknown as Response);

      expect(mockStorageService.get).toHaveBeenCalledWith(
        'file-123',
        StorageNamespace.FILES,
      );
    });

    it('should throw NotFoundException when file does not exist', async () => {
      mockStorageService.get.mockResolvedValue(undefined);

      await expect(
        controller.findOne('missing', mockRes as unknown as Response),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // --- Legacy PUT ---

  describe('create', () => {
    it('should return the id on success', async () => {
      const result = await controller.create('file-456', Buffer.from('data'));

      expect(result).toEqual({ id: 'file-456' });
    });

    it('should store using the flat key', async () => {
      const payload = Buffer.from('new-file-data');

      await controller.create('file-456', payload);

      expect(mockStorageService.set).toHaveBeenCalledWith(
        'file-456',
        payload,
        StorageNamespace.FILES,
      );
    });
  });

  // --- Legacy PATCH touch ---

  describe('touch', () => {
    it('should return id and ISO updatedAt when file exists', async () => {
      mockStorageService.touch.mockResolvedValue(true);

      const result = await controller.touch('file-789');

      expect(result).toEqual({
        id: 'file-789',
        updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
    });

    it('should throw NotFoundException when file does not exist', async () => {
      mockStorageService.touch.mockResolvedValue(false);

      await expect(controller.touch('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // --- Prefixed GET ---

  describe('findOneWithPrefix', () => {
    let mockRes: MockResponse;

    beforeEach(() => {
      mockRes = createMockResponse();
    });

    it('should look up using the composite key', async () => {
      mockStorageService.get.mockResolvedValue(Buffer.from('data'));

      await controller.findOneWithPrefix(
        'rooms',
        'room-abc',
        'file-1',
        mockRes as unknown as Response,
      );

      expect(mockStorageService.get).toHaveBeenCalledWith(
        'rooms_room-abc_file-1',
        StorageNamespace.FILES,
      );
    });

    it('should stream the prefixed file data', async () => {
      const fileData = Buffer.from('prefixed-data');
      mockStorageService.get.mockResolvedValue(fileData);

      await controller.findOneWithPrefix(
        'shareLinks',
        'link-abc',
        'file-1',
        mockRes as unknown as Response,
      );

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', 13);
    });

    it('should fall back to the flat key when rooms composite key is not found', async () => {
      mockStorageService.get
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(Buffer.from('legacy'));

      await controller.findOneWithPrefix(
        'rooms',
        'room-abc',
        'file-1',
        mockRes as unknown as Response,
      );

      expect(mockStorageService.get).toHaveBeenNthCalledWith(
        2,
        'file-1',
        StorageNamespace.FILES,
      );
    });

    it('should serve legacy data content when rooms fallback succeeds', async () => {
      const legacyData = Buffer.from('legacy-content');
      mockStorageService.get
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(legacyData);

      await controller.findOneWithPrefix(
        'rooms',
        'room-abc',
        'file-1',
        mockRes as unknown as Response,
      );

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', 14);
    });

    it('should not fall back to flat key for shareLinks prefix', async () => {
      mockStorageService.get.mockResolvedValue(undefined);

      await expect(
        controller.findOneWithPrefix(
          'shareLinks',
          'link-abc',
          'file-1',
          mockRes as unknown as Response,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should only query storage once for shareLinks miss', async () => {
      mockStorageService.get.mockResolvedValue(undefined);

      await controller
        .findOneWithPrefix(
          'shareLinks',
          'link-abc',
          'file-1',
          mockRes as unknown as Response,
        )
        .catch(() => {});

      expect(mockStorageService.get).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when rooms composite and legacy both miss', async () => {
      mockStorageService.get.mockResolvedValue(undefined);

      await expect(
        controller.findOneWithPrefix(
          'rooms',
          'room-abc',
          'missing',
          mockRes as unknown as Response,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // --- Prefixed PUT ---

  describe('createWithPrefix', () => {
    it('should return id and prefix on success', async () => {
      const result = await controller.createWithPrefix(
        'rooms',
        'room-abc',
        'file-1',
        Buffer.from('data'),
      );

      expect(result).toEqual({ id: 'file-1', prefix: 'rooms' });
    });

    it('should store using the composite key', async () => {
      const payload = Buffer.from('data');

      await controller.createWithPrefix(
        'shareLinks',
        'link-abc',
        'file-1',
        payload,
      );

      expect(mockStorageService.set).toHaveBeenCalledWith(
        'shareLinks_link-abc_file-1',
        payload,
        StorageNamespace.FILES,
      );
    });
  });

  // --- Prefixed PATCH touch ---

  describe('touchWithPrefix', () => {
    it('should return id, prefix, and updatedAt when composite key exists', async () => {
      mockStorageService.touch.mockResolvedValue(true);

      const result = await controller.touchWithPrefix(
        'rooms',
        'room-abc',
        'file-1',
      );

      expect(result).toEqual({
        id: 'file-1',
        prefix: 'rooms',
        updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
    });

    it('should touch using the composite key', async () => {
      mockStorageService.touch.mockResolvedValue(true);

      await controller.touchWithPrefix('rooms', 'room-abc', 'file-1');

      expect(mockStorageService.touch).toHaveBeenCalledWith(
        'rooms_room-abc_file-1',
        StorageNamespace.FILES,
      );
    });

    it('should fall back to flat key when rooms composite key not found', async () => {
      mockStorageService.touch
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      await controller.touchWithPrefix('rooms', 'room-abc', 'file-1');

      expect(mockStorageService.touch).toHaveBeenNthCalledWith(
        2,
        'file-1',
        StorageNamespace.FILES,
      );
    });

    it('should return success when rooms fallback touch succeeds', async () => {
      mockStorageService.touch
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const result = await controller.touchWithPrefix(
        'rooms',
        'room-abc',
        'file-1',
      );

      expect(result).toEqual({
        id: 'file-1',
        prefix: 'rooms',
        updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
    });

    it('should not fall back to flat key for shareLinks prefix', async () => {
      mockStorageService.touch.mockResolvedValue(false);

      await controller
        .touchWithPrefix('shareLinks', 'link-abc', 'file-1')
        .catch(() => {});

      expect(mockStorageService.touch).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when rooms composite and legacy both miss', async () => {
      mockStorageService.touch.mockResolvedValue(false);

      await expect(
        controller.touchWithPrefix('rooms', 'room-abc', 'missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for shareLinks when not found', async () => {
      mockStorageService.touch.mockResolvedValue(false);

      await expect(
        controller.touchWithPrefix('shareLinks', 'link-abc', 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // --- Validation ---

  describe('ValidateIdParam', () => {
    const validator = new ValidateIdParam();

    it('should accept alphanumeric values with hyphens', () => {
      expect(validator.transform('room-abc-123')).toBe('room-abc-123');
    });

    it('should reject underscores', () => {
      expect(() => validator.transform('room_abc')).toThrow(
        BadRequestException,
      );
    });

    it('should reject path traversal characters', () => {
      expect(() => validator.transform('../etc')).toThrow(BadRequestException);
    });

    it('should reject slashes', () => {
      expect(() => validator.transform('foo/bar')).toThrow(BadRequestException);
    });

    it('should reject empty strings', () => {
      expect(() => validator.transform('')).toThrow(BadRequestException);
    });

    it('should reject values over 128 characters', () => {
      expect(() => validator.transform('a'.repeat(129))).toThrow(
        BadRequestException,
      );
    });

    it('should accept exactly 128 characters', () => {
      expect(validator.transform('a'.repeat(128))).toHaveLength(128);
    });
  });

  describe('ValidatePrefixParam', () => {
    const validator = new ValidatePrefixParam();

    it('should accept "rooms"', () => {
      expect(validator.transform('rooms')).toBe('rooms');
    });

    it('should accept "shareLinks"', () => {
      expect(validator.transform('shareLinks')).toBe('shareLinks');
    });

    it('should reject unknown prefixes', () => {
      expect(() => validator.transform('unknown')).toThrow(BadRequestException);
    });

    it('should reject empty string', () => {
      expect(() => validator.transform('')).toThrow(BadRequestException);
    });
  });
});
