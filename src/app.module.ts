import {
  Logger,
  MiddlewareConsumer,
  Module,
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

const logger = new Logger('AppModule');

const buildProviders = () => {
  const ttlProvider = addTtlProvider();
  const providers: any[] = [StorageService];
  if (ttlProvider) {
    providers.push(ttlProvider);
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
