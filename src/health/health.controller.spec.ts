import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { StorageService } from '../storage/storage.service';

describe('HealthController', () => {
  let controller: HealthController;
  let storageService: StorageService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [StorageService],
      controllers: [HealthController],
    }).compile();

    storageService = module.get<StorageService>(StorageService);
    controller = module.get<HealthController>(HealthController);
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns healthy', async () => {
    jest.spyOn(storageService, 'set').mockImplementation(() => {
      return new Promise((resolve) => {
        return resolve(true);
      });
    });
    expect(await controller.health()).toBe('healthy');
  });
});
