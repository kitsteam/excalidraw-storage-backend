import type { KeyvStoreAdapter } from 'keyv';

/**
 * Re-export KeyvStoreAdapter from keyv library.
 * This type represents store implementations that can be injected into StorageService
 * (e.g., @keyv/postgres for production, in-memory Map for testing).
 */
export type KeyvStore = KeyvStoreAdapter;

/**
 * Factory function type for creating KeyvStore instances.
 */
export type KeyvStoreFactory = () => KeyvStore;

/**
 * Injection token for the KeyvStore factory.
 */
export const KEYV_STORE_FACTORY = Symbol('KEYV_STORE_FACTORY');
