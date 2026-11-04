import { NestFactory } from '@nestjs/core';

const app = {
  setGlobalPrefix: jest.fn(),
  useBodyParser: jest.fn(),
  listen: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn(),
  },
}));

const runBootstrap = async () => {
  await jest.isolateModulesAsync(async () => {
    await import('./main');
  });
  await new Promise(setImmediate);
};

describe('bootstrap', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    (NestFactory.create as jest.Mock).mockResolvedValue(app);
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should disable default body parsers to prevent binary data corruption', async () => {
    await runBootstrap();

    expect(NestFactory.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        bodyParser: false,
      }),
    );
  });

  it('should pass the LOG_LEVEL threshold to both servers', async () => {
    process.env.LOG_LEVEL = 'warn';
    process.env.AI_ENABLED = 'true';

    await runBootstrap();

    for (const [, options] of (NestFactory.create as jest.Mock).mock.calls) {
      expect(options.logger).toEqual(['fatal', 'error', 'warn']);
    }
  });

  it('should not start the AI server by default', async () => {
    delete process.env.AI_ENABLED;

    await runBootstrap();

    expect(NestFactory.create).toHaveBeenCalledTimes(1);
    expect(app.listen).toHaveBeenCalledTimes(1);
  });

  it('should start the AI server on AI_PORT when AI_ENABLED is true', async () => {
    process.env.AI_ENABLED = 'true';
    process.env.AI_PORT = '9090';

    await runBootstrap();

    const createCalls = (NestFactory.create as jest.Mock).mock.calls;
    expect(createCalls.map(([module]) => module.name)).toEqual([
      'AppModule',
      'AiModule',
    ]);
    expect(createCalls[1][1]).toEqual(expect.objectContaining({ cors: true }));
    expect(app.useBodyParser).toHaveBeenCalledWith('json', { limit: '50mb' });
    expect(app.listen).toHaveBeenLastCalledWith('9090');
  });
});
