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
  const providers: Provider[] = [StorageService];
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
