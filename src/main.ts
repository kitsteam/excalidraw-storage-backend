import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getLogLevels } from './log-levels';

async function bootstrap() {
  const logLevels = getLogLevels();

  const app = await NestFactory.create(AppModule, {
    cors: true,
    bodyParser: false,
    logger: logLevels,
  });

  app.setGlobalPrefix(process.env.GLOBAL_PREFIX ?? '/api/v2');

  await app.listen(process.env.PORT ?? 8080);
}
bootstrap();
