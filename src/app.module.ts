import KeyvDynamo from '@keyv/dynamo';
import KeyvEtcd from '@keyv/etcd';
import KeyvMemcache from '@keyv/memcache';
import KeyvMongo from '@keyv/mongo';
import KeyvMysql from '@keyv/mysql';
import KeyvPostgres from '@keyv/postgres';
import KeyvRedis from '@keyv/redis';
import KeyvSqlite from '@keyv/sqlite';
import KeyvValkey from '@keyv/valkey';
import {
  Logger,
  MiddlewareConsumer,
  Module,
  Provider,
  RequestMethod,
} from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RawParserMiddleware } from './raw-parser.middleware';
import { ScenesController } from './scenes/scenes.controller';
import { StorageService } from './storage/storage.service';
import { RoomsController } from './rooms/rooms.controller';
import { FilesController } from './files/files.controller';
import { HealthController } from './health/health.controller';
import { PostgresTtlService } from './ttl/postgres-ttl.service';
import { SqliteTtlService } from './ttl/sqlite-ttl.service';
import { KEYV_STORE_FACTORY } from './storage/keyv-store.interface';
import { TOUCH_CONFIG, TouchConfig } from './storage/touch-config.interface';

const logger = new Logger('AppModule');

export const buildKeyvStoreFactoryProvider = (): [
  Provider | undefined,
  Provider | undefined,
] => {
  const uri = process.env['STORAGE_URI'];
  if (!uri) {
    logger.warn(
      'STORAGE_URI is undefined, will use non persistent in memory storage',
    );
    return [undefined, undefined];
  }

  const adapter = process.env['DATABASE_ADAPTER'];
  switch (adapter) {
    case 'redis':
      return [
        { provide: KEYV_STORE_FACTORY, useValue: () => new KeyvRedis(uri) },
        undefined,
      ];
    case 'valkey':
      return [
        { provide: KEYV_STORE_FACTORY, useValue: () => new KeyvValkey(uri) },
        undefined,
      ];
    case 'mysql': {
      // MySQL TTL support: https://github.com/jaredwray/keyv/tree/main/storage/mysql#native-ttl-support-with-expires-column
      const intervalExpiration =
        parseInt(process.env['MYSQL_TTL_CLEANUP_INTERVAL_SECONDS'], 10) || 3600;
      return [
        {
          provide: KEYV_STORE_FACTORY,
          useValue: () => new KeyvMysql({ uri, intervalExpiration }),
        },
        undefined,
      ];
    }
    case 'mongo':
      return [
        { provide: KEYV_STORE_FACTORY, useValue: () => new KeyvMongo(uri) },
        undefined,
      ];
    case 'sqlite': {
      const storeProvider = {
        provide: KEYV_STORE_FACTORY,
        useValue: () => new KeyvSqlite(uri),
      };
      const ttlEnabled = process.env['ENABLE_SQLITE_TTL_SERVICE'] == 'true';
      if (ttlEnabled) {
        logger.log('Enabling SqliteTtlService');
      }
      return [storeProvider, ttlEnabled ? SqliteTtlService : undefined];
    }
    case 'etcd':
      return [
        { provide: KEYV_STORE_FACTORY, useValue: () => new KeyvEtcd(uri) },
        undefined,
      ];
    case 'memcache':
      return [
        {
          provide: KEYV_STORE_FACTORY,
          useValue: () => new KeyvMemcache(uri),
        },
        undefined,
      ];
    case 'dynamo':
      return [
        { provide: KEYV_STORE_FACTORY, useValue: () => new KeyvDynamo(uri) },
        undefined,
      ];
    case 'postgres': {
      const storeProvider = {
        provide: KEYV_STORE_FACTORY,
        useValue: () => new KeyvPostgres({ uri }),
      };
      const ttlEnabled = process.env['ENABLE_POSTGRES_TTL_SERVICE'] == 'true';
      if (ttlEnabled) {
        logger.log('Enabling PostgresTtlService');
      }
      return [storeProvider, ttlEnabled ? PostgresTtlService : undefined];
    }
    default:
      logger.warn(
        `Unknown DATABASE_ADAPTER "${adapter}". Set DATABASE_ADAPTER to a supported database adapter: postgres, mysql, redis, valkey, mongo, sqlite, etcd, memcache, dynamo.`,
      );
      return [undefined, undefined];
  }
};

const buildProviders = () => {
  const [keyvStoreFactoryProvider, ttlProvider] =
    buildKeyvStoreFactoryProvider();
  const touchConfigProvider = buildTouchConfigProvider();
  const providers: Provider[] = [StorageService, touchConfigProvider];
  if (ttlProvider) {
    providers.push(ttlProvider);
  }
  if (keyvStoreFactoryProvider) {
    providers.push(keyvStoreFactoryProvider);
  }
  return providers;
};

const buildTouchConfigProvider = (): Provider => {
  const storageUri = process.env['STORAGE_URI'];
  const touchEnabled = process.env['ENABLE_POSTGRES_TOUCH'] === 'true';
  const ttl = parseInt(process.env['STORAGE_TTL'], 10) || 86400000;

  const enabled = Boolean(storageUri && touchEnabled);

  if (touchEnabled && !storageUri) {
    logger.warn(
      'ENABLE_POSTGRES_TOUCH is true but STORAGE_URI is not set - touch disabled',
    );
  }

  if (enabled) {
    logger.log('Enabling PostgreSQL touch functionality');
  }

  return {
    provide: TOUCH_CONFIG,
    useValue: { enabled, ttl } as TouchConfig,
  };
};

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [
    ScenesController,
    RoomsController,
    FilesController,
    HealthController,
  ],
  providers: buildProviders(),
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RawParserMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
