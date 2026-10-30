import { buildKeyvStoreFactoryProvider } from './app.module';
import { KEYV_STORE_FACTORY } from './storage/keyv-store.interface';
import { PostgresTtlService } from './ttl/postgres-ttl.service';
import { SqliteTtlService } from './ttl/sqlite-ttl.service';

describe('buildKeyvStoreFactoryProvider', () => {
  const ENV_KEYS = [
    'STORAGE_URI',
    'DATABASE_ADAPTER',
    'ENABLE_POSTGRES_TTL_SERVICE',
    'ENABLE_SQLITE_TTL_SERVICE',
  ];
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterAll(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it('returns no providers when STORAGE_URI is unset', () => {
    const [storeProvider, ttlProvider] = buildKeyvStoreFactoryProvider();

    expect(storeProvider).toBeUndefined();
    expect(ttlProvider).toBeUndefined();
  });

  it('returns no providers when DATABASE_ADAPTER is unset (breaking: no implicit postgres)', () => {
    process.env['STORAGE_URI'] = 'postgres://localhost';

    const [storeProvider, ttlProvider] = buildKeyvStoreFactoryProvider();

    expect(storeProvider).toBeUndefined();
    expect(ttlProvider).toBeUndefined();
  });

  it('returns no providers for an unrecognized DATABASE_ADAPTER', () => {
    process.env['STORAGE_URI'] = 'postgres://localhost';
    process.env['DATABASE_ADAPTER'] = 'not-a-real-adapter';

    const [storeProvider, ttlProvider] = buildKeyvStoreFactoryProvider();

    expect(storeProvider).toBeUndefined();
    expect(ttlProvider).toBeUndefined();
  });

  it.each([
    'redis',
    'valkey',
    'mysql',
    'mongo',
    'sqlite',
    'etcd',
    'memcache',
    'dynamo',
    'postgres',
  ])('configures a store for adapter "%s"', (adapter) => {
    process.env['STORAGE_URI'] = 'placeholder://localhost';
    process.env['DATABASE_ADAPTER'] = adapter;

    const [storeProvider] = buildKeyvStoreFactoryProvider();

    expect(storeProvider).toMatchObject({ provide: KEYV_STORE_FACTORY });
  });

  it('does not enable PostgresTtlService by default', () => {
    process.env['STORAGE_URI'] = 'postgres://localhost';
    process.env['DATABASE_ADAPTER'] = 'postgres';

    const [, ttlProvider] = buildKeyvStoreFactoryProvider();

    expect(ttlProvider).toBeUndefined();
  });

  it('enables PostgresTtlService when ENABLE_POSTGRES_TTL_SERVICE=true', () => {
    process.env['STORAGE_URI'] = 'postgres://localhost';
    process.env['DATABASE_ADAPTER'] = 'postgres';
    process.env['ENABLE_POSTGRES_TTL_SERVICE'] = 'true';

    const [, ttlProvider] = buildKeyvStoreFactoryProvider();

    expect(ttlProvider).toBe(PostgresTtlService);
  });

  it('enables SqliteTtlService when ENABLE_SQLITE_TTL_SERVICE=true', () => {
    process.env['STORAGE_URI'] = 'sqlite:///tmp/does-not-matter.sqlite';
    process.env['DATABASE_ADAPTER'] = 'sqlite';
    process.env['ENABLE_SQLITE_TTL_SERVICE'] = 'true';

    const [, ttlProvider] = buildKeyvStoreFactoryProvider();

    expect(ttlProvider).toBe(SqliteTtlService);
  });

  it('does not wire PostgresTtlService when running sqlite, even if ENABLE_POSTGRES_TTL_SERVICE=true', () => {
    process.env['STORAGE_URI'] = 'sqlite:///tmp/does-not-matter.sqlite';
    process.env['DATABASE_ADAPTER'] = 'sqlite';
    process.env['ENABLE_POSTGRES_TTL_SERVICE'] = 'true';

    const [, ttlProvider] = buildKeyvStoreFactoryProvider();

    expect(ttlProvider).toBeUndefined();
  });

  it('does not wire SqliteTtlService when running postgres, even if ENABLE_SQLITE_TTL_SERVICE=true', () => {
    process.env['STORAGE_URI'] = 'postgres://localhost';
    process.env['DATABASE_ADAPTER'] = 'postgres';
    process.env['ENABLE_SQLITE_TTL_SERVICE'] = 'true';

    const [, ttlProvider] = buildKeyvStoreFactoryProvider();

    expect(ttlProvider).toBeUndefined();
  });

  it.each(['redis', 'valkey', 'mysql', 'mongo', 'etcd', 'memcache', 'dynamo'])(
    'never returns a ttl provider for adapter "%s" (no external cleanup needed)',
    (adapter) => {
      process.env['STORAGE_URI'] = 'placeholder://localhost';
      process.env['DATABASE_ADAPTER'] = adapter;
      process.env['ENABLE_POSTGRES_TTL_SERVICE'] = 'true';
      process.env['ENABLE_SQLITE_TTL_SERVICE'] = 'true';

      const [, ttlProvider] = buildKeyvStoreFactoryProvider();

      expect(ttlProvider).toBeUndefined();
    },
  );
});
