/**
 * Configuration for the touch functionality.
 * Controls whether the optimized PostgreSQL touch method is used.
 */
export interface TouchConfig {
  /** Whether PostgreSQL touch functionality is enabled */
  enabled: boolean;
  /** TTL in milliseconds for refreshed records */
  ttl: number;
}

/**
 * Injection token for touch configuration.
 */
export const TOUCH_CONFIG = Symbol('TOUCH_CONFIG');
