import { Test, TestingModule } from '@nestjs/testing';
import { ScenesController } from './scenes.controller';
import { StorageService } from '../storage/storage.service';

describe('ScenesController', () => {
  let controller: ScenesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StorageService],
      controllers: [ScenesController],
    }).compile();

    controller = module.get<ScenesController>(ScenesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
