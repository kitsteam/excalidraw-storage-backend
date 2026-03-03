import { RawParserMiddleware } from './raw-parser.middleware';

describe('RawParserMiddleware', () => {
  it('should be defined', () => {
    expect(new RawParserMiddleware()).toBeDefined();
  });

  it('should call next when request has no body', (done) => {
    const middleware = new RawParserMiddleware();
    const mockReq = {
      headers: {},
      on: jest.fn((event, cb) => {
        if (event === 'end') cb();
        return mockReq;
      }),
      removeListener: jest.fn().mockReturnThis(),
      readable: true,
    };
    const mockRes = {};

    middleware.use(mockReq, mockRes, () => {
      done();
    });
  });
});
