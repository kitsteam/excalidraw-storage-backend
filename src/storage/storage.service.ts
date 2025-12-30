import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import Keyv from 'keyv';
import {
  KEYV_STORE_FACTORY,
  KeyvStore,
  KeyvStoreFactory,
} from './keyv-store.interface';
import { TOUCH_CONFIG, TouchConfig } from './touch-config.interface';
import { QueryResult } from 'pg';


@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly logger = new Logger(StorageService.name);
  private readonly storagesMap = new Map<string, Keyv>();
  private store?: KeyvStore;
  private readonly ttl: number;

  constructor(
    @Optional()
    @Inject(KEYV_STORE_FACTORY)
    storeFactory?: KeyvStoreFactory,
    @Optional()
    @Inject(TOUCH_CONFIG)
    private readonly touchConfig?: TouchConfig,
  ) {
    this.ttl = parseInt(process.env['STORAGE_TTL'], 10) || 86400000;

    // Use injected factory if provided, otherwise Keyv uses its built-in in-memory store
    if (storeFactory) {
      this.store = storeFactory();
    }

    Object.keys(StorageNamespace).forEach((namespace) => {
      // Only pass store option if we have one - otherwise Keyv uses its built-in Map
      const keyvOptions: { namespace: string; ttl: number; store?: KeyvStore } =
        {
          namespace,
          ttl: this.ttl,
        };
      if (this.store) {
        keyvOptions.store = this.store;
      }

      const keyv = new Keyv(keyvOptions);
      keyv.on('error', (err) =>
        this.logger.error(`Connection Error for namespace ${namespace}`, err),
      );

      this.storagesMap.set(namespace, keyv);
    });
  }

  async onModuleDestroy() {
      this.logger.log('Closing database connections...');

      try {
        // Clear all Keyv instances first
        this.storagesMap.clear();

      // Close the shared store if it has a disconnect method
      if (this.store?.disconnect) {
        await this.store.disconnect();
        this.logger.log('Database connection closed successfully');
      }
    } catch (err) {
      this.logger.error('Error closing database connection:', err);
    }
  }

  get(key: string, namespace: StorageNamespace): Promise<Buffer> {
    return this.storagesMap.get(namespace).get(key);
  }
  async has(key: string, namespace: StorageNamespace): Promise<boolean> {
    const val = await this.get(key, namespace);
    return val !== undefined && val !== null;
  }
  set(
    key: string,
    value: Buffer | string,
    namespace: StorageNamespace,
  ): Promise<boolean> {
    return this.storagesMap.get(namespace).set(key, value);
  }

  /**
   * Refresh TTL for an existing record.
   * Uses optimized SQL when postgres touch is enabled, otherwise falls back to Keyv get+set.
   */
  async touch(key: string, namespace: StorageNamespace): Promise<boolean> {
    // If postgres touch is enabled and store with query method is available, use optimized SQL
    if (this.touchConfig?.enabled && this.store?.query) {
      return this.touchPostgres(key, namespace);
    }

    // Fallback: use Keyv get+set to refresh TTL
    return this.touchKeyv(key, namespace);
  }

  /**
   * Optimized postgres-only touch - updates TTL via SQL without reading the value.
   */
  private async touchPostgres(
    key: string,
    namespace: StorageNamespace,
  ): Promise<boolean> {
    try {
      const expires = Date.now() + this.ttl;
      const fullKey = `${namespace}:${key}`;

      const result = await this.store!.query!(
        `UPDATE keyv
         SET value = jsonb_set(value::jsonb, '{expires}', to_jsonb($1::bigint))
         WHERE key = $2`,
        [expires, fullKey],
      );

      const rowCount = (result as QueryResult).rowCount;

      if (rowCount === 0) {
        this.logger.warn(`[touch] No record found for ${namespace}:${key}`);
        return false;
      }

      this.logger.debug(
        `[touch] Refreshed TTL via Postgres for ${namespace}:${key} -> ${new Date(
          expires,
        ).toISOString()}`,
      );
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[touch] Failed to refresh TTL for ${namespace}:${key}: ${message}`,
      );
      return false;
    }
  }

  /**
   * Fallback touch using Keyv's get+set - reads value and re-sets it to reset TTL.
   */
  private async touchKeyv(
    key: string,
    namespace: StorageNamespace,
  ): Promise<boolean> {
    try {
      const value = await this.get(key, namespace);
      if (value === undefined || value === null) {
        this.logger.warn(`[touch] No record found for ${namespace}:${key}`);
        return false;
      }

      await this.set(key, value, namespace);
      this.logger.debug(
        `[touch] Refreshed TTL via Keyv for ${namespace}:${key}`,
      );
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[touch] Failed to refresh TTL for ${namespace}:${key}: ${message}`,
      );
      return false;
    }
  }
}

export enum StorageNamespace {
  SCENES = 'SCENES',
  ROOMS = 'ROOMS',
  FILES = 'FILES',
  SETTINGS = 'SETTINGS',
}
