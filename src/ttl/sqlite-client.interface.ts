/**
 * Interface for SQLite client operations required by SqliteTtlService.
 * This abstraction allows for dependency injection of different client implementations.
 */
export interface SqliteClient {
  connect(): Promise<void> | void;
  query(sql: string): Promise<{ rowCount: number }>;
  end(): Promise<void>;
}

/**
 * Factory function type for creating SqliteClient instances.
 */
export type SqliteClientFactory = () => SqliteClient;

/**
 * Injection token for the SqliteClient factory.
 */
export const SQLITE_CLIENT_FACTORY = Symbol('SQLITE_CLIENT_FACTORY');
