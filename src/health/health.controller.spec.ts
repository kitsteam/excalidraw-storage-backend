import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { StorageService } from '../storage/storage.service';
import { createMockStorageService } from '../../test/mocks/storage.mock';

describe('HealthController', () => {
  let controller: HealthController;
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
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
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

  it('returns healthy', async () => {
    expect(await controller.health()).toBe('healthy');
    expect(mockStorageService.set).toHaveBeenCalledWith(
      'last-health-check',
      expect.any(String),
      expect.anything(),
    );
  });
});
