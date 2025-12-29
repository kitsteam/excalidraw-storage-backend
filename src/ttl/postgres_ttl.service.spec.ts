import { PGlite } from '@electric-sql/pglite';
import { Test, TestingModule } from '@nestjs/testing';
import Keyv from 'keyv';
import KeyvPostgres from '@keyv/postgres';
import { StorageNamespace } from '../storage/storage.service';
import { POSTGRES_CLIENT_FACTORY } from './postgres-client.interface';
import { PostgresTtlService } from './postgres_ttl.service';
import { PGlitePoolAdapter, createPGliteClientFactory } from '../../test/utils';
import { configurePGMock } from '../../test/setup';

/**
 * Test helper that wraps Keyv with real @keyv/postgres for in-memory PostgreSQL testing.
 * Uses PGlite under the hood via the pg mock.
 */
class TestStorageHelper {
  storagesMap = new Map<string, Keyv>();
  private store: KeyvPostgres;

  constructor(ttl: number) {
    // Create the real KeyvPostgres - it will use our mocked pg.Pool
    // which is backed by PGlite
    this.store = new KeyvPostgres({
      uri: 'postgresql://test:test@localhost:5432/test',
      table: 'keyv',
    });

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
  let db: PGlite;
  let poolAdapter: PGlitePoolAdapter;
  let module: TestingModule;

  const setupServicesWithTtl = async (ttl: number) => {
    if (db) {
      await db.close();
    }
    db = new PGlite();
    poolAdapter = new PGlitePoolAdapter(db);

    // Configure the pg mock to use our PGlite adapter
    configurePGMock(poolAdapter);

    // Set the environment variable that PostgresTtlService expects
    process.env.STORAGE_URI = 'postgresql://test:test@localhost:5432/test';

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

  const clearDatabase = async () => {
    if (db) {
      await db.query('DELETE FROM keyv');
    }
  };

  afterEach(async () => {
    await clearDatabase();
    if (storageHelper) {
      await storageHelper.disconnect();
    }
    if (module) {
      await module.close();
    }
    configurePGMock(null);
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
    delete process.env.STORAGE_URI;
  });

  it('should be defined', async () => {
    await setupServicesWithTtl(10);
    expect(postgresTtlService).toBeDefined();
  });

  it('deletes items from postgres database which a ttl older than now', async () => {
    await setupServicesWithTtl(-10000);
    await storageHelper.set('key', 'value', StorageNamespace.ROOMS);
    const expired_items_count = await postgresTtlService.deleteExpiredItems();

    expect(expired_items_count).toBe(1);
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

  it('does not delete items after switching ttls', async () => {
    await setupServicesWithTtl(1000000);
    await storageHelper.set('new', 'new-value', StorageNamespace.ROOMS);

    // Create a new storage helper with negative TTL but reusing the same pg mock
    const expiredStorageHelper = new TestStorageHelper(-1000);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await expiredStorageHelper.set(
      'expired',
      'expired-value',
      StorageNamespace.ROOMS,
    );

    const expired_items_count = await postgresTtlService.deleteExpiredItems();

    expect(expired_items_count).toBe(1);
    expect(await storageHelper.get('new', StorageNamespace.ROOMS)).toEqual(
      'new-value',
    );
    expect(
      await storageHelper.get('expired', StorageNamespace.ROOMS),
    ).toBeUndefined();

    await expiredStorageHelper.disconnect();
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
