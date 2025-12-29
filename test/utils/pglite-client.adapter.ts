import { PGlite } from '@electric-sql/pglite';
import {
  PostgresClient,
  PostgresClientFactory,
} from '../../src/ttl/postgres-client.interface';

/**
 * Adapter that wraps PGlite to implement the PostgresClient interface.
 * Used for in-memory PostgreSQL testing.
 */
export class PGliteClientAdapter implements PostgresClient {
  constructor(private readonly db: PGlite) {}

  async connect(): Promise<void> {
    // PGlite is already connected when instantiated
  }

  async query(sql: string): Promise<{ rowCount: number }> {
    const result = await this.db.query(sql);
    return { rowCount: result.affectedRows ?? 0 };
  }

  async end(): Promise<void> {
    // PGlite lifecycle is managed externally
  }
}

/**
 * Creates a PostgresClientFactory that uses PGlite.
 */
export function createPGliteClientFactory(db: PGlite): PostgresClientFactory {
  return () => new PGliteClientAdapter(db);
}
