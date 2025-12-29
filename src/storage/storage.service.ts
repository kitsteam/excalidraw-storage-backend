import KeyvPostgres from '@keyv/postgres';
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

@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly logger = new Logger(StorageService.name);
  storagesMap = new Map<string, Keyv>();
  private store?: KeyvStore;

  constructor(
    @Optional()
    @Inject(KEYV_STORE_FACTORY)
    storeFactory?: KeyvStoreFactory,
  ) {
    const uri: string = process.env[`STORAGE_URI`];
    const ttl: number = parseInt(process.env[`STORAGE_TTL`], 10);

    // Determine which store to use:
    // 1. Injected factory (for testing)
    // 2. KeyvPostgres if STORAGE_URI is set (production)
    // 3. Keyv's built-in in-memory store (no store option)
    if (storeFactory) {
      this.store = storeFactory();
    } else if (uri) {
      this.store = new KeyvPostgres({ uri });
    } else {
      this.logger.warn(
        `STORAGE_URI is undefined, will use non persistent in memory storage`,
      );
      // store remains undefined - Keyv will use its built-in Map store
    }

    Object.keys(StorageNamespace).forEach((namespace) => {
      // Only pass store option if we have one - otherwise Keyv uses its built-in Map
      const keyvOptions: { namespace: string; ttl: number; store?: KeyvStore } =
        {
          namespace,
          ttl,
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

export enum StorageNamespace {
  SCENES = 'SCENES',
  ROOMS = 'ROOMS',
  FILES = 'FILES',
  SETTINGS = 'SETTINGS',
}
