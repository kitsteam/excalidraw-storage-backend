import { Test, TestingModule } from '@nestjs/testing';
import { ScenesController } from './scenes.controller';
import { StorageService } from '../storage/storage.service';

describe('ScenesController', () => {
  let controller: ScenesController;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [StorageService],
      controllers: [ScenesController],
    }).compile();

    controller = module.get<ScenesController>(ScenesController);
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
