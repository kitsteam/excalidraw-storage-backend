import { Test, TestingModule } from '@nestjs/testing';
import Keyv from 'keyv';
import KeyvPostgres from '@keyv/postgres';
import { StorageNamespace } from '../storage/storage.service';
import { POSTGRES_CLIENT_FACTORY } from './postgres-client.interface';
import { PostgresTtlService } from './postgres_ttl.service';
import { PgMockManager, createPGliteClientFactory } from '../../test/utils';

/**
 * Test helper that wraps Keyv with real @keyv/postgres for in-memory PostgreSQL testing.
 * Uses PGlite under the hood via the pg mock.
 */
class TestStorageHelper {
  private storagesMap = new Map<string, Keyv>();
  private store: KeyvPostgres;

  constructor(ttl: number) {
    // Create the real KeyvPostgres - it will use our mocked pg.Pool
    // which is backed by PGlite
    this.store = new KeyvPostgres();

    Object.keys(StorageNamespace).forEach((namespace) => {
      const keyv = new Keyv({
        store: this.store,
        namespace,
        ttl,
      });
      this.storagesMap.set(namespace, keyv);
    });
  }

  get(key: string, namespace: StorageNamespace): Promise<Buffer> {
    return this.storagesMap.get(namespace)!.get(key);
  }

  set(
    key: string,
    value: Buffer | string,
    namespace: StorageNamespace,
  ): Promise<boolean> {
    return this.storagesMap.get(namespace)!.set(key, value);
  }

  async disconnect(): Promise<void> {
    await this.store.disconnect();
  }
}

describe('PostgresTtlService', () => {
  let postgresTtlService: PostgresTtlService;
  let storageHelper: TestStorageHelper;
  let module: TestingModule;

  const setupServicesWithTtl = async (ttl: number) => {
    const db = PgMockManager.getInstance().getDb();

    storageHelper = new TestStorageHelper(ttl);

    module = await Test.createTestingModule({
      providers: [
        PostgresTtlService,
        {
          provide: POSTGRES_CLIENT_FACTORY,
          useValue: createPGliteClientFactory(db),
        },
      ],
    }).compile();

    postgresTtlService = module.get<PostgresTtlService>(PostgresTtlService);
  };

  afterEach(async () => {
    await PgMockManager.getInstance().clearDatabase();
    if (storageHelper) {
      await storageHelper.disconnect();
    }
    if (module) {
      await module.close();
    }
  });

  afterAll(async () => {
    delete process.env.STORAGE_URI;
  });

  it('should be defined', async () => {
    await setupServicesWithTtl(10);
    expect(postgresTtlService).toBeDefined();
  });

  it('deletes items from postgres database which a ttl older than now', async () => {
    await setupServicesWithTtl(-10000);
    await storageHelper.set('key', 'value', StorageNamespace.ROOMS);
    const expiredItemsCount = await postgresTtlService.deleteExpiredItems();

    expect(expiredItemsCount).toBe(1);
    expect(
      await storageHelper.get('key', StorageNamespace.ROOMS),
    ).toBeUndefined();
  });

  it('does not delete items from postgres database which a ttl newer than now', async () => {
    await setupServicesWithTtl(1000000);
    await storageHelper.set('key', 'value', StorageNamespace.ROOMS);
    const expired_items_count = await postgresTtlService.deleteExpiredItems();

    expect(expired_items_count).toBe(0);
    expect(await storageHelper.get('key', StorageNamespace.ROOMS)).toEqual(
      'value',
    );
  });

  it('deletes items from in all namespaces', async () => {
    await setupServicesWithTtl(-10000);
    await storageHelper.set('key-rooms', 'value', StorageNamespace.ROOMS);
    await storageHelper.set('key-files', 'value', StorageNamespace.FILES);
    await storageHelper.set('key-scenes', 'value', StorageNamespace.SCENES);

    const expired_items_count = await postgresTtlService.deleteExpiredItems();

    expect(expired_items_count).toBe(3);
    expect(
      await storageHelper.get('key-rooms', StorageNamespace.ROOMS),
    ).toBeUndefined();
    expect(
      await storageHelper.get('key-files', StorageNamespace.FILES),
    ).toBeUndefined();
    expect(
      await storageHelper.get('key-scenes', StorageNamespace.SCENES),
    ).toBeUndefined();
  });
});
