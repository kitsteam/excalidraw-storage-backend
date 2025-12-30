import { Test, TestingModule } from '@nestjs/testing';
import { StorageNamespace, StorageService } from './storage.service';

describe('StorageService', () => {
  let service: StorageService;
  let module: TestingModule;

  beforeEach(async () => {
    // No STORAGE_URI set = Keyv uses its built-in in-memory Map store
    delete process.env.STORAGE_URI;

    module = await Test.createTestingModule({
      providers: [StorageService],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should store and retrieve values', async () => {
    await service.set('test-key', 'test-value', StorageNamespace.ROOMS);
    const result = await service.get('test-key', StorageNamespace.ROOMS);
    expect(result).toBe('test-value');
  });

  it('should return undefined for non-existent keys', async () => {
    const result = await service.get('non-existent', StorageNamespace.ROOMS);
    expect(result).toBeUndefined();
  });

  it('should check if key exists', async () => {
    expect(await service.has('test-key', StorageNamespace.ROOMS)).toBe(false);
    await service.set('test-key', 'test-value', StorageNamespace.ROOMS);
    expect(await service.has('test-key', StorageNamespace.ROOMS)).toBe(true);
  });

  it('should store values in separate namespaces', async () => {
    await service.set('same-key', 'rooms-value', StorageNamespace.ROOMS);
    await service.set('same-key', 'files-value', StorageNamespace.FILES);

    expect(await service.get('same-key', StorageNamespace.ROOMS)).toBe(
      'rooms-value',
    );
    expect(await service.get('same-key', StorageNamespace.FILES)).toBe(
      'files-value',
    );
  });
});
