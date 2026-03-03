import { NestFactory } from '@nestjs/core';

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn().mockResolvedValue({
      setGlobalPrefix: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('bootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should disable default body parsers to prevent binary data corruption', async () => {
    await import('./main');

    expect(NestFactory.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        bodyParser: false,
      }),
    );
  });
});
