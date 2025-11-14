import KeyvPostgres from '@keyv/postgres';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Keyv from 'keyv';

@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly logger = new Logger(StorageService.name);
  storagesMap = new Map<string, Keyv>();
  private postgresStore: KeyvPostgres;

  constructor() {
    const uri: string = process.env[`STORAGE_URI`];
    const ttl: number = parseInt(process.env[`STORAGE_TTL`], 10);
    if (!uri) {
      this.logger.warn(
        `STORAGE_URI is undefined, will use non persistant in memory storage`,
      );
    }

    // Create a single PostgreSQL store instance to share among all Keyv instances
    this.postgresStore = new KeyvPostgres({ uri });

    Object.keys(StorageNamespace).forEach((namespace) => {
      const keyv = new Keyv({
        store: this.postgresStore,
        namespace,
        ttl,
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
    return this.storagesMap.get(namespace).get(key);
  }
  async has(key: string, namespace: StorageNamespace): Promise<boolean> {
    return !!(await this.storagesMap.get(namespace).get(key));
  }
  set(
    key: string,
    value: Buffer | string,
    namespace: StorageNamespace,
  ): Promise<boolean> {
    return this.storagesMap.get(namespace).set(key, value);
  }
}

async touch(key: string, namespace: StorageNamespace): Promise<boolean> {
  try {
    const query = (this.postgresStore as any).query;
    const expires = Date.now() + this.ttl;
    const fullKey = `${namespace}:${key}`;

    const result = await query(
      `UPDATE keyv
         SET value = jsonb_set(value::jsonb, '{expires}', to_jsonb($1::bigint))
         WHERE key = $2`,
      [expires, fullKey],
    );

    return result.rowCount > 0;
  } catch {
    return false;
  }
}

export enum StorageNamespace {
  SCENES = 'SCENES',
  ROOMS = 'ROOMS',
  FILES = 'FILES',
  SETTINGS = 'SETTINGS',
}
