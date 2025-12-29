/**
 * Singleton manager for pg mock adapters.
 * Provides thread-safe access to the current PGlite pool adapter
 * used by the mocked pg.Pool.
 */
export class PgMockManager {
  private static instance: PgMockManager;
  private currentAdapter: MockedPoolAdapter | null = null;

  private constructor() {}

  static getInstance(): PgMockManager {
    if (!PgMockManager.instance) {
      PgMockManager.instance = new PgMockManager();
    }
    return PgMockManager.instance;
  }

  /**
   * Configure the pg mock to use a PGlite-backed adapter.
   * Call this in tests that need real @keyv/postgres behavior.
   */
  configure(
    adapter: {
      query: (sql: string, values?: unknown[]) => Promise<unknown>;
      end: () => Promise<void>;
    } | null,
  ): void {
    if (adapter) {
      this.currentAdapter = {
        query: jest.fn(adapter.query.bind(adapter)),
        end: jest.fn(adapter.end.bind(adapter)),
      };
    } else {
      this.currentAdapter = null;
    }
  }

  /**
   * Get the current adapter, or null if not configured.
   */
  getAdapter(): MockedPoolAdapter | null {
    return this.currentAdapter;
  }

  /**
   * Clear the current adapter.
   */
  clear(): void {
    this.currentAdapter = null;
  }
}

interface MockedPoolAdapter {
  query: jest.Mock;
  end: jest.Mock;
}
