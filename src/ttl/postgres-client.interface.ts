/**
 * Interface for PostgreSQL client operations required by PostgresTtlService.
 * This abstraction allows for dependency injection of different client implementations
 * (e.g., pg.Client for production, PGlite adapter for testing).
 */
export interface PostgresClient {
  connect(): Promise<void> | void;
  query(sql: string): Promise<{ rowCount: number }>;
  end(): Promise<void>;
}

/**
 * Factory function type for creating PostgresClient instances.
 */
export type PostgresClientFactory = () => PostgresClient;

/**
 * Injection token for the PostgresClient factory.
 */
export const POSTGRES_CLIENT_FACTORY = Symbol('POSTGRES_CLIENT_FACTORY');
