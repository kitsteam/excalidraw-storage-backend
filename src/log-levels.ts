import { Logger, LogLevel } from '@nestjs/common';

const LOG_LEVELS: LogLevel[] = [
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
];

function isLogLevel(value: unknown): value is LogLevel {
  return LOG_LEVELS.includes(value as LogLevel);
}

export function getLogLevels(env: NodeJS.ProcessEnv = process.env): LogLevel[] {
  const fallback: LogLevel = env.NODE_ENV === 'production' ? 'log' : 'debug';
  const requested = env.LOG_LEVEL;
  if (requested && !isLogLevel(requested)) {
    new Logger('Bootstrap').warn(
      `Invalid LOG_LEVEL "${requested}", falling back to "${fallback}"`,
    );
  }
  const level = isLogLevel(requested) ? requested : fallback;
  return LOG_LEVELS.slice(0, LOG_LEVELS.indexOf(level) + 1);
}
