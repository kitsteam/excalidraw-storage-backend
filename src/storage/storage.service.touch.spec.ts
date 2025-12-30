import { Provider } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QueryResult } from 'pg';
import { KEYV_STORE_FACTORY, KeyvStore } from './keyv-store.interface';
import { StorageService, StorageNamespace } from './storage.service';
import { TOUCH_CONFIG, TouchConfig } from './touch-config.interface';

const createMockKeyvStore = (): KeyvStore => ({
  get: jest.fn().mockResolvedValue(undefined),
  set: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(true),
  clear: jest.fn().mockResolvedValue(undefined),
  query: jest.fn(),
  disconnect: jest.fn().mockResolvedValue(undefined),
  opts: {},
  on: jest.fn(),
});

interface KeyvFallbackTestCase {
  name: string;
  config: TouchConfig | undefined;
}

describe('StorageService - touch()', () => {
  let service: StorageService;
  let module: TestingModule;
  let mockStore: KeyvStore;

  const mockTtl = 86400000;
  const testKey = 'test-key-123';
  const testNamespace = StorageNamespace.SCENES;

  const enabledTouchConfig: TouchConfig = { enabled: true, ttl: mockTtl };
  const disabledTouchConfig: TouchConfig = { enabled: false, ttl: mockTtl };

  // Helper to create mock QueryResult
  const createQueryResult = (rowCount: number): Partial<QueryResult> => ({
    rowCount,
    rows: [],
    command: 'UPDATE',
    oid: 0,
    fields: [],
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('when postgres touch is enabled', () => {
    beforeEach(async () => {
      mockStore = createMockKeyvStore();

      module = await Test.createTestingModule({
        providers: [
          StorageService,
          {
            provide: KEYV_STORE_FACTORY,
            useValue: () => mockStore,
          },
          {
            provide: TOUCH_CONFIG,
            useValue: enabledTouchConfig,
          },
        ],
      }).compile();

      service = module.get<StorageService>(StorageService);
    });

    it('should refresh TTL via SQL for an existing record', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(1000000000);
      (mockStore.query as jest.Mock).mockResolvedValue(createQueryResult(1));

      const result = await service.touch(testKey, testNamespace);

      expect(result).toBe(true);
      expect(mockStore.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE keyv'),
        [1000000000 + mockTtl, `${testNamespace}:${testKey}`],
      );
    });

    it('should return false when record not found', async () => {
      (mockStore.query as jest.Mock).mockResolvedValue(createQueryResult(0));

      const result = await service.touch(testKey, testNamespace);

      expect(result).toBe(false);
    });

    it('should return false and log error on query failure', async () => {
      (mockStore.query as jest.Mock).mockRejectedValue(new Error('Database error'));

      const result = await service.touch(testKey, testNamespace);

      expect(result).toBe(false);
    });

    it('should correctly calculate expires timestamp', async () => {
      const currentTime = 5000000000;
      jest.spyOn(Date, 'now').mockReturnValue(currentTime);
      (mockStore.query as jest.Mock).mockResolvedValue(createQueryResult(1));

      await service.touch(testKey, testNamespace);

      expect(mockStore.query).toHaveBeenCalledWith(
        expect.any(String),
        [currentTime + mockTtl, expect.any(String)],
      );
    });
  });

  // Test all Keyv fallback scenarios with parameterized tests
  const fallbackTestCases: KeyvFallbackTestCase[] = [
    { name: 'touch disabled', config: disabledTouchConfig },
    { name: 'no touch config provided', config: undefined },
    { name: 'touch enabled but no postgres store', config: enabledTouchConfig },
  ];

  describe.each(fallbackTestCases)('Keyv fallback when $name', ({ config }) => {
    let mockKeyvGet: jest.SpyInstance;
    let mockKeyvSet: jest.SpyInstance;

    beforeEach(async () => {
      const providers: Provider[] = [StorageService];
      if (config) {
        providers.push({ provide: TOUCH_CONFIG, useValue: config });
      }
      // Note: No KEYV_STORE_FACTORY provided = uses in-memory Keyv

      module = await Test.createTestingModule({ providers }).compile();
      service = module.get<StorageService>(StorageService);

      mockKeyvGet = jest.spyOn(service, 'get');
      mockKeyvSet = jest.spyOn(service, 'set');
    });

    it('should refresh TTL using get+set when record exists', async () => {
      const mockValue = Buffer.from('test-data');
      mockKeyvGet.mockResolvedValue(mockValue);
      mockKeyvSet.mockResolvedValue(true);

      const result = await service.touch(testKey, testNamespace);

      expect(result).toBe(true);
      expect(mockKeyvGet).toHaveBeenCalledWith(testKey, testNamespace);
      expect(mockKeyvSet).toHaveBeenCalledWith(
        testKey,
        mockValue,
        testNamespace,
      );
    });

    it('should return false when record not found (undefined)', async () => {
      mockKeyvGet.mockResolvedValue(undefined);

      const result = await service.touch(testKey, testNamespace);

      expect(result).toBe(false);
      expect(mockKeyvSet).not.toHaveBeenCalled();
    });

    it('should return false when record not found (null)', async () => {
      mockKeyvGet.mockResolvedValue(null);

      const result = await service.touch(testKey, testNamespace);

      expect(result).toBe(false);
      expect(mockKeyvSet).not.toHaveBeenCalled();
    });

    it('should return false and log error on failure', async () => {
      mockKeyvGet.mockRejectedValue(new Error('Keyv error'));

      const result = await service.touch(testKey, testNamespace);

      expect(result).toBe(false);
    });
  });
});
