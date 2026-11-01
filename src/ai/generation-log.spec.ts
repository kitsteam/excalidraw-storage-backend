import { Logger } from '@nestjs/common';
import { GenerationLog, HEARTBEAT_INTERVAL_MS } from './generation-log';

describe('GenerationLog', () => {
  const logger = new Logger('test');
  let log: jest.SpyInstance;
  let debug: jest.SpyInstance;
  let warn: jest.SpyInstance;

  const lines = (spy: jest.SpyInstance): string[] =>
    spy.mock.calls.map(([message]) => message);

  beforeEach(() => {
    jest.useFakeTimers();
    log = jest.spyOn(logger, 'log').mockImplementation();
    debug = jest.spyOn(logger, 'debug').mockImplementation();
    warn = jest.spyOn(logger, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('logs the start with the request details', () => {
    new GenerationLog(logger, 'text-to-diagram', '1 messages');

    expect(lines(log)[0]).toMatch(
      /^\[ai#\d+\] text-to-diagram started \(1 messages\)$/,
    );
  });

  it('gives every generation its own id', () => {
    new GenerationLog(logger, 'a', '').end('finished', true, 0);
    new GenerationLog(logger, 'b', '').end('finished', true, 0);

    const ids = lines(log).map((line) => line.match(/^\[ai#(\d+)\]/)?.[1]);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).toBe(ids[3]);
    expect(ids[0]).not.toBe(ids[2]);
  });

  it('logs the first text token only once', () => {
    const generation = new GenerationLog(logger, 'task', '');
    jest.advanceTimersByTime(1500);

    generation.text();
    generation.text();

    expect(lines(debug)).toEqual([
      expect.stringMatching(/first token after 1\.5s$/),
    ]);
  });

  it('logs a heartbeat with progress until the generation ends', () => {
    const generation = new GenerationLog(logger, 'task', '');
    generation.reasoning();
    generation.reasoning();

    jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    generation.end('finished', true, 0);
    jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3);

    expect(lines(debug)).toEqual([
      expect.stringMatching(
        /still generating after 10\.0s \(0 text chunks, 2 reasoning chunks\)$/,
      ),
    ]);
  });

  it('logs a successful end with duration and booked tokens', () => {
    const generation = new GenerationLog(logger, 'task', '');
    jest.advanceTimersByTime(2000);

    generation.end('finished (stop)', true, 1234);

    expect(lines(log)[1]).toMatch(
      /task finished \(stop\) after 2\.0s \(booked 1234 tokens\)$/,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs an unsuccessful end as a warning', () => {
    new GenerationLog(logger, 'task', '').end('timed out', false, 10);

    expect(lines(warn)).toEqual([
      expect.stringMatching(/task timed out after 0\.0s \(booked 10 tokens\)$/),
    ]);
  });
});
