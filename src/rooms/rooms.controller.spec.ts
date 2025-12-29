import { Test, TestingModule } from '@nestjs/testing';
import { RoomsController } from './rooms.controller';
import { StorageService } from '../storage/storage.service';
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

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
