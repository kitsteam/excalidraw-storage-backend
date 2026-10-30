import { randomUUID } from 'crypto';
import { existsSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import Keyv from 'keyv';
import KeyvSqlite from '@keyv/sqlite';
import { StorageNamespace } from '../storage/storage.service';
import { SQLITE_CLIENT_FACTORY } from './sqlite-client.interface';
import { SqliteTtlService } from './sqlite-ttl.service';

/**
 * Test helper that wraps Keyv with a real @keyv/sqlite backed by a throwaway file on
 * disk (shared across connections, unlike :memory:).
 */
class TestStorageHelper {
  private storagesMap = new Map<string, Keyv>();
  private store: KeyvSqlite;

  constructor(dbPath: string, ttl: number) {
    this.store = new KeyvSqlite(`sqlite://${dbPath}`);

    Object.keys(StorageNamespace).forEach((namespace) => {
      const keyv = new Keyv({
        store: this.store,
        namespace,
        ttl,
      });
      this.storagesMap.set(namespace, keyv);
    });
  }

  set(
    key: string,
    value: Buffer | string,
    namespace: StorageNamespace,
  ): Promise<boolean> {
    return this.storagesMap.get(namespace)!.set(key, value);
  }

  async disconnect(): Promise<void> {
    await this.store.close();
  }
}

describe('SqliteTtlService', () => {
  let sqliteTtlService: SqliteTtlService;
  let storageHelper: TestStorageHelper;
  let module: TestingModule;
  let dbPath: string;

  const setupServicesWithTtl = async (ttl: number) => {
    dbPath = join(tmpdir(), `sqlite-ttl-test-${randomUUID()}.sqlite`);
    process.env['STORAGE_URI'] = `sqlite://${dbPath}`;

    storageHelper = new TestStorageHelper(dbPath, ttl);

    module = await Test.createTestingModule({
      providers: [SqliteTtlService],
    }).compile();

    sqliteTtlService = module.get<SqliteTtlService>(SqliteTtlService);
  };

  afterEach(async () => {
    if (storageHelper) {
      await storageHelper.disconnect();
    }
    if (module) {
      await module.close();
    }
    delete process.env['STORAGE_URI'];
    if (dbPath && existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  it('should be defined', async () => {
    await setupServicesWithTtl(10);
    expect(sqliteTtlService).toBeDefined();
  });

  it('deletes items from sqlite database which a ttl older than now', async () => {
    await setupServicesWithTtl(-10000);
    await storageHelper.set('key', 'value', StorageNamespace.ROOMS);
    const expiredItemsCount = await sqliteTtlService.deleteExpiredItems();

    expect(expiredItemsCount).toBe(1);
  });

  it('does not delete items from sqlite database which a ttl newer than now', async () => {
    await setupServicesWithTtl(1000000);
    await storageHelper.set('key', 'value', StorageNamespace.ROOMS);
    const expiredItemsCount = await sqliteTtlService.deleteExpiredItems();

    expect(expiredItemsCount).toBe(0);
  });

  it('deletes items from all namespaces', async () => {
    await setupServicesWithTtl(-10000);
    await storageHelper.set('key-rooms', 'value', StorageNamespace.ROOMS);
    await storageHelper.set('key-files', 'value', StorageNamespace.FILES);
    await storageHelper.set('key-scenes', 'value', StorageNamespace.SCENES);

    const expiredItemsCount = await sqliteTtlService.deleteExpiredItems();

    expect(expiredItemsCount).toBe(3);
  });

  it('handleCron should call deleteExpiredItems', async () => {
    await setupServicesWithTtl(10);
    const spy = jest
      .spyOn(sqliteTtlService, 'deleteExpiredItems')
      .mockResolvedValue(0);

    await sqliteTtlService.handleCron();

    expect(spy).toHaveBeenCalled();
  });

  it('should return 0 and not throw when database error occurs', async () => {
    await setupServicesWithTtl(10);
    const mockClientFactory = () => ({
      connect: jest.fn().mockRejectedValue(new Error('connection refused')),
      query: jest.fn(),
      end: jest.fn(),
    });

    const failModule = await Test.createTestingModule({
      providers: [
        SqliteTtlService,
        {
          provide: SQLITE_CLIENT_FACTORY,
          useValue: mockClientFactory,
        },
      ],
    }).compile();

    const failService = failModule.get<SqliteTtlService>(SqliteTtlService);
    const result = await failService.deleteExpiredItems();

    expect(result).toBe(0);

    await failModule.close();
  });
});
