import KeyvPostgres from '@keyv/postgres';
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
import { KEYV_STORE_FACTORY } from './storage/keyv-store.interface';
import { TOUCH_CONFIG, TouchConfig } from './storage/touch-config.interface';

const logger = new Logger('AppModule');

const buildKeyvStoreFactoryProvider = (): Provider | undefined => {
  const uri = process.env['STORAGE_URI'];
  if (uri) {
    return {
      provide: KEYV_STORE_FACTORY,
      useValue: () => new KeyvPostgres({ uri }),
    };
  }
  logger.warn(
    'STORAGE_URI is undefined, will use non persistent in memory storage',
  );
  return undefined;
};

const buildProviders = () => {
  const ttlProvider = addTtlProvider();
  const keyvStoreFactoryProvider = buildKeyvStoreFactoryProvider();
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

const addTtlProvider = () => {
  if (process.env['ENABLE_POSTGRES_TTL_SERVICE'] == 'true') {
    logger.log('Enabling PostgresTtlService');
    return PostgresTtlService;
  }
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
