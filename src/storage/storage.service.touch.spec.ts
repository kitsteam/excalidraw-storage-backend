import { Test, TestingModule } from '@nestjs/testing';
import { StorageService, StorageNamespace } from './storage.service';
import { QueryResult } from 'pg';

describe('StorageService - touch()', () => {
  let service: StorageService;
  let module: TestingModule;
  let mockPostgresStore: any;
  let mockLogger: any;
  beforeEach(async () => {
    mockPostgresStore = {
      query: jest.fn(),
      disconnect: jest.fn(),
    };

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    module = await Test.createTestingModule({
      providers: [StorageService],
    }).compile();

    service = module.get<StorageService>(StorageService);

    (service as any).postgresStore = mockPostgresStore;
    (service as any).logger = mockLogger;
    (service as any).ttl = 86400000;
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
    jest.clearAllMocks();
  });
  describe('touch', () => {
    const testKey = 'test-key-123';
    const testNamespace = StorageNamespace.SCENES;
    const mockTtl = 86400000;

    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValue(1000000000);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });    it('should successfully refresh TTL for an existing record', async () => {
      const expectedExpires = 1000000000 + mockTtl;
      const expectedFullKey = `${testNamespace}:${testKey}`;
      const mockQueryResult: Partial<QueryResult> = {
        rowCount: 1,
        rows: [],
        command: 'UPDATE',
        oid: 0,
        fields: [],
      };

      mockPostgresStore.query.mockResolvedValue(mockQueryResult);

      const result = await service.touch(testKey, testNamespace);

      expect(result).toBe(true);
      expect(mockPostgresStore.query).toHaveBeenCalledTimes(1);
      expect(mockPostgresStore.query).toHaveBeenCalledWith(
        `UPDATE keyv
         SET value = jsonb_set(value::jsonb, '{expires}', to_jsonb($1::bigint))
         WHERE key = $2`,
        [expectedExpires, expectedFullKey],
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining(`[touch] ✅ Refreshed TTL for ${testNamespace}:${testKey}`),
      );
      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });    it('should correctly calculate expires timestamp', async () => {
      const currentTime = 5000000000;
      jest.spyOn(Date, 'now').mockReturnValue(currentTime);
      const expectedExpires = currentTime + mockTtl;

      const mockQueryResult: Partial<QueryResult> = {
        rowCount: 1,
        rows: [],
        command: 'UPDATE',
        oid: 0,
        fields: [],
      };

      mockPostgresStore.query.mockResolvedValue(mockQueryResult);

      await service.touch(testKey, testNamespace);

      expect(mockPostgresStore.query).toHaveBeenCalledWith(
        `UPDATE keyv
         SET value = jsonb_set(value::jsonb, '{expires}', to_jsonb($1::bigint))
         WHERE key = $2`,
        [expectedExpires, expect.any(String)],
      );
    });
  });
});
