import { Test, TestingModule } from '@nestjs/testing';
import { FilesController } from './files.controller';
import { StorageService } from '../storage/storage.service';
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

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
