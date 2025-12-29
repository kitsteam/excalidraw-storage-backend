import { Test, TestingModule } from '@nestjs/testing';
import { ScenesController } from './scenes.controller';
import { StorageService } from '../storage/storage.service';
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

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
