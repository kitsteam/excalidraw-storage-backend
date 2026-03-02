import { PGlite } from '@electric-sql/pglite';

/**
 * Adapter that makes PGlite compatible with pg.Pool interface.
 * This allows using the real @keyv/postgres package with PGlite
 * instead of maintaining a separate KeyvPGlite implementation.
 */
export class PGlitePoolAdapter {
  constructor(private readonly db: PGlite) {}

  /**
   * Execute a query - matches pg.Pool.query() signature
   */
  async query(sql: string, values?: unknown[]) {
    const result = await this.db.query(sql, values);
    return {
      rows: result.rows,
      rowCount: result.affectedRows ?? result.rows.length,
    };
  }

  /**
   * End the pool connection - no-op for PGlite as lifecycle is managed externally
   */
  async end(): Promise<void> {
    // PGlite lifecycle is managed externally
  }

  /**
   * Connect method for compatibility - PGlite is already connected
   */
  async connect() {
    return {
      query: this.query.bind(this),
      release: () => {},
    };
  }
}
