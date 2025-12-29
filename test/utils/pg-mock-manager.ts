import { PGlite } from '@electric-sql/pglite';
import { PGlitePoolAdapter } from './pglite-pool.adapter';

/**
 * Singleton manager for pg mock adapters.
 * Provides thread-safe access to a shared PGlite instance
 * used by the mocked pg.Pool.
 */
export class PgMockManager {
  private static instance: PgMockManager;
  private readonly db: PGlite;
  private readonly adapter: PGlitePoolAdapter;

  private constructor() {
    this.db = new PGlite();
    this.adapter = new PGlitePoolAdapter(this.db);
  }

  static getInstance(): PgMockManager {
    if (!PgMockManager.instance) {
      PgMockManager.instance = new PgMockManager();
    }
    return PgMockManager.instance;
  }

  /**
   * Get the pool adapter for use by pg.Pool mock.
   */
  getAdapter(): PGlitePoolAdapter {
    return this.adapter;
  }

  /**
   * Get the underlying PGlite instance for direct database access.
   */
  getDb(): PGlite {
    return this.db;
  }

  /**
   * Clear all data from the database (for test isolation).
   */
  async clearDatabase(): Promise<void> {
    // Get all tables and truncate them
    const result = await this.db.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    for (const row of result.rows) {
      await this.db.query(`DELETE FROM "${row.tablename}"`);
    }
  }
}
