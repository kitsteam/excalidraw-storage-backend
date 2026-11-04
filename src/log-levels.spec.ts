import { Logger } from '@nestjs/common';
import { getLogLevels } from './log-levels';

describe('getLogLevels', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('should enable the given level and all more severe levels', () => {
    expect(getLogLevels({ LOG_LEVEL: 'warn' })).toEqual([
      'fatal',
      'error',
      'warn',
    ]);
  });

  it('should enable all levels for verbose', () => {
    expect(getLogLevels({ LOG_LEVEL: 'verbose' })).toEqual([
      'fatal',
      'error',
      'warn',
      'log',
      'debug',
      'verbose',
    ]);
  });

  it('should prefer LOG_LEVEL over the NODE_ENV default', () => {
    expect(
      getLogLevels({ LOG_LEVEL: 'error', NODE_ENV: 'development' }),
    ).toEqual(['fatal', 'error']);
  });

  it('should default to debug outside of production', () => {
    expect(getLogLevels({})).toEqual([
      'fatal',
      'error',
      'warn',
      'log',
      'debug',
    ]);
  });

  it('should default to log in production', () => {
    expect(getLogLevels({ NODE_ENV: 'production' })).toEqual([
      'fatal',
      'error',
      'warn',
      'log',
    ]);
  });

  it('should warn and fall back to the default for an invalid LOG_LEVEL', () => {
    expect(
      getLogLevels({ LOG_LEVEL: 'trace', NODE_ENV: 'production' }),
    ).toEqual(['fatal', 'error', 'warn', 'log']);
    expect(warn).toHaveBeenCalledWith(
      'Invalid LOG_LEVEL "trace", falling back to "log"',
    );
  });
});
