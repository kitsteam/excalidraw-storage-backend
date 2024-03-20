import { Test, TestingModule } from '@nestjs/testing';
import { RoomsController } from './rooms.controller';
import { StorageService } from '../storage/storage.service';

describe('RoomsController', () => {
  let controller: RoomsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StorageService],
      controllers: [RoomsController],
    }).compile();

    controller = module.get<RoomsController>(RoomsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
