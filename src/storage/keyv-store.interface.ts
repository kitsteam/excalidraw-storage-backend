import type { KeyvStoreAdapter } from 'keyv';

/**
 * Extended KeyvStoreAdapter that includes postgres-specific methods.
 * The query method is available when using @keyv/postgres.
 */
export interface KeyvStore extends KeyvStoreAdapter {
  /**
   * Execute a raw SQL query (postgres-specific).
   * Available when using @keyv/postgres adapter.
   */
  query?: (sql: string, params?: unknown[]) => Promise<unknown>;
}

/**
 * Factory function type for creating KeyvStore instances.
 */
export type KeyvStoreFactory = () => KeyvStore;

/**
 * Injection token for the KeyvStore factory.
 */
export const KEYV_STORE_FACTORY = Symbol('KEYV_STORE_FACTORY');
