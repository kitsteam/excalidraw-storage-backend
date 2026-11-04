import { LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AiModule } from './ai/ai.module';
import { getAiPort, isAiEnabled } from './ai/ai-config';
import { getLogLevels } from './log-levels';

async function bootstrapAi(logLevels: LogLevel[]) {
  const app = await NestFactory.create<NestExpressApplication>(AiModule, {
    cors: true,
    logger: logLevels,
  });

  app.useBodyParser('json', { limit: process.env.BODY_LIMIT ?? '50mb' });

  await app.listen(getAiPort());
}

async function bootstrap() {
  const logLevels = getLogLevels();

  const app = await NestFactory.create(AppModule, {
    cors: true,
    bodyParser: false,
    logger: logLevels,
  });

  app.setGlobalPrefix(process.env.GLOBAL_PREFIX ?? '/api/v2');

  await app.listen(process.env.PORT ?? 8080);

  if (isAiEnabled()) {
    await bootstrapAi(logLevels);
  }
}
bootstrap();
