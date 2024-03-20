import { Test, TestingModule } from '@nestjs/testing';
import { FilesController } from './files.controller';
import { StorageService } from '../storage/storage.service';

describe('FilesController', () => {
  let controller: FilesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StorageService],
      controllers: [FilesController],
    }).compile();

    controller = module.get<FilesController>(FilesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
