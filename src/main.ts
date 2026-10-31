import { LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AiModule } from './ai/ai.module';
import { getAiPort, isAiEnabled } from './ai/ai-config';

function isLogLevel(value: any): value is LogLevel {
  return value in ['log', 'error', 'warn', 'debug', 'verbose'];
}

async function bootstrapAi(logLevel: LogLevel) {
  const app = await NestFactory.create<NestExpressApplication>(AiModule, {
    cors: true,
    logger: [logLevel],
  });

  app.useBodyParser('json', { limit: process.env.BODY_LIMIT ?? '50mb' });

  await app.listen(getAiPort());
}

async function bootstrap() {
  const logLevel = isLogLevel(process.env.LOG_LEVEL)
    ? process.env.LOG_LEVEL
    : 'log';

  const app = await NestFactory.create(AppModule, {
    cors: true,
    bodyParser: false,
    logger: [logLevel],
  });

  app.setGlobalPrefix(process.env.GLOBAL_PREFIX ?? '/api/v2');

  await app.listen(process.env.PORT ?? 8080);

  if (isAiEnabled()) {
    await bootstrapAi(logLevel);
  }
}
bootstrap();
