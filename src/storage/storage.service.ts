import KeyvPostgres from '@keyv/postgres';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Keyv from 'keyv';
import { Pool, QueryResult } from 'pg';

interface KeyvPostgresInternal extends KeyvPostgres {
  query: Pool['query'];
  client?: Pool;
}

@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly logger = new Logger(StorageService.name);
  private readonly storagesMap = new Map<string, Keyv>();
  private readonly postgresStore: KeyvPostgresInternal;
  private readonly ttl: number;

  constructor() {
    const uri = process.env['STORAGE_URI'];
    this.ttl = parseInt(process.env['STORAGE_TTL'], 10);

    if (!uri) {
      this.logger.warn(
        `STORAGE_URI is undefined, will use non persistant in memory storage`,
      );
    }

    // Create a single PostgreSQL store instance to share among all Keyv instances
    this.postgresStore = new KeyvPostgres({ uri }) as KeyvPostgresInternal;

    Object.keys(StorageNamespace).forEach((namespace) => {
      const keyv = new Keyv({
        store: this.postgresStore,
        namespace,
        ttl: this.ttl,
      });

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

        // Close the shared PostgreSQL store once
        if (this.postgresStore) {
          await this.postgresStore.disconnect();
          this.logger.log('Database connection closed successfully');
        }
      } catch (err) {
        this.logger.error('Error closing database connection:', err);
      }
    }

  get(key: string, namespace: StorageNamespace): Promise<Buffer> {
    return this.storagesMap.get(namespace)?.get(key);
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
    return this.storagesMap.get(namespace)?.set(key, value);
  }

  // Refresh TTL for an existing record in the Keyv/Postgres table.
  async touch(key: string, namespace: StorageNamespace): Promise<boolean> {
    try {
      const expires = Date.now() + this.ttl;
      const fullKey = `${namespace}:${key}`;

      const result = await this.postgresStore.query(
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
        `[touch] ✅ Refreshed TTL for ${namespace}:${key} → ${new Date(
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
}

export enum StorageNamespace {
  SCENES = 'SCENES',
  ROOMS = 'ROOMS',
  FILES = 'FILES',
  SETTINGS = 'SETTINGS',
}
