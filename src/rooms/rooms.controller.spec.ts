import { Test, TestingModule } from '@nestjs/testing';
import { RoomsController } from './rooms.controller';
import { StorageService } from '../storage/storage.service';

describe('RoomsController', () => {
  let controller: RoomsController;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [StorageService],
      controllers: [RoomsController],
    }).compile();

    controller = module.get<RoomsController>(RoomsController);
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
