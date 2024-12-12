import KeyvPostgres from '@keyv/postgres';
import { Injectable, Logger } from '@nestjs/common';
import Keyv from 'keyv';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  storagesMap = new Map<string, Keyv>();

  constructor() {
    const uri: string = process.env[`STORAGE_URI`];
    const ttl: number = parseInt(process.env[`STORAGE_TTL`], 10);
    if (!uri) {
      this.logger.warn(
        `STORAGE_URI is undefined, will use non persistant in memory storage`,
      );
    }

    Object.keys(StorageNamespace).forEach((namespace) => {
      const keyv = new Keyv({
        store: new KeyvPostgres({
          uri,
        }),
        namespace,
        ttl,
      });
      keyv.on('error', (err) =>
        this.logger.error(`Connection Error for namespace ${namespace}`, err),
      );
      this.storagesMap.set(namespace, keyv);
    });
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
