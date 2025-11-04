import { Test, TestingModule } from '@nestjs/testing';
import { PostgresTtlService } from './postgres_ttl.service';
import { StorageNamespace, StorageService } from '../storage/storage.service';
import {
  clearDatabase,
  createTestDatabaseSetup,
} from '../../test/helpers/postgres_helper';

beforeAll(() => {
  return createTestDatabaseSetup();
});

describe('PostgresTtlService', () => {
  let postgresTtlService: PostgresTtlService;
  let storageService: StorageService;
  let module: TestingModule;

  const setupServicesWithTtl = async (ttl: string) => {
    // Close previous module if it exists
    if (module) {
      await module.close();
    }

    process.env[`STORAGE_TTL`] = ttl;
    module = await Test.createTestingModule({
      providers: [PostgresTtlService, StorageService],
    }).compile();
    storageService = module.get<StorageService>(StorageService);
    postgresTtlService = module.get<PostgresTtlService>(PostgresTtlService);
  };

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should be defined', async () => {
    await setupServicesWithTtl('10');
    expect(postgresTtlService).toBeDefined();
  });

  it('deletes items from postgres database which a ttl older than now', async () => {
    await setupServicesWithTtl('-10000');
    await storageService.set('key', 'value', StorageNamespace.ROOMS);
    const expired_items_count = await postgresTtlService.deleteExpiredItems();

    expect(expired_items_count).toBe(1);
    expect(
      await storageService.get('key', StorageNamespace.ROOMS),
    ).toBeUndefined();
  });

  it('does not delete items from postgres database which a ttl newer than now', async () => {
    await setupServicesWithTtl('1000');
    await storageService.set('key', 'value', StorageNamespace.ROOMS);
    const expired_items_count = await postgresTtlService.deleteExpiredItems();

    expect(expired_items_count).toBe(0);
    expect(await storageService.get('key', StorageNamespace.ROOMS)).toEqual(
      'value',
    );
  });

  it('does not delete items after switching ttls', async () => {
    await setupServicesWithTtl('1000');
    await storageService.set('new', 'new-value', StorageNamespace.ROOMS);

    await setupServicesWithTtl('-1000');
    await storageService.set(
      'expired',
      'expired-value',
      StorageNamespace.ROOMS,
    );

    const expired_items_count = await postgresTtlService.deleteExpiredItems();

    expect(expired_items_count).toBe(1);
    expect(await storageService.get('new', StorageNamespace.ROOMS)).toEqual(
      'new-value',
    );
    expect(
      await storageService.get('expired', StorageNamespace.ROOMS),
    ).toBeUndefined();
  });

  it('deletes items from in all namespaces', async () => {
    await setupServicesWithTtl('-10000');
    await storageService.set('key-rooms', 'value', StorageNamespace.ROOMS);
    await storageService.set('key-files', 'value', StorageNamespace.FILES);
    await storageService.set('key-scenes', 'value', StorageNamespace.SCENES);

    const expired_items_count = await postgresTtlService.deleteExpiredItems();

    expect(expired_items_count).toBe(3);
    expect(
      await storageService.get('key-rooms', StorageNamespace.ROOMS),
    ).toBeUndefined();
    expect(
      await storageService.get('key-files', StorageNamespace.FILES),
    ).toBeUndefined();
    expect(
      await storageService.get('key-scenes', StorageNamespace.SCENES),
    ).toBeUndefined();
  });
});
