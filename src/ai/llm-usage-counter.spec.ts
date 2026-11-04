import { Pool } from 'pg';
import { PgMockManager } from '../../test/utils';
import { InMemoryLlmUsageCounter } from './in-memory-llm-usage-counter.service';
import { currentDateUsage, LlmUsageCounting } from './llm-usage.interface';
import { PostgresLlmUsageCounter } from './postgres-llm-usage-counter.service';

// pg.Pool is mocked with PGlite in test/setup.ts.
const newPostgresCounter = () => new PostgresLlmUsageCounter(new Pool());

it('currentDateUsage produces UTC date keys independent of locale', () => {
  expect(currentDateUsage(new Date('2026-05-08T23:30:00Z'))).toBe('2026-05-08');
});

describe.each<[string, () => LlmUsageCounting]>([
  ['InMemoryLlmUsageCounter', () => new InMemoryLlmUsageCounter()],
  ['PostgresLlmUsageCounter', newPostgresCounter],
])('%s', (_name, createCounter) => {
  let service: LlmUsageCounting;

  beforeEach(() => {
    service = createCounter();
  });

  afterEach(async () => {
    await PgMockManager.getInstance().clearDatabase();
  });

  it('reserve accumulates tokens and requests per date', async () => {
    await service.reserve('2026-05-08', 200);
    const totals = await service.reserve('2026-05-08', 300);
    expect(totals).toEqual({ tokensUsed: 500, requestsCount: 2 });
  });

  it('reserve returns null and books nothing when the cap would be exceeded', async () => {
    await service.reserve('2026-05-08', 80, 100);
    expect(await service.reserve('2026-05-08', 30, 100)).toBeNull();
    expect(await service.reserve('2026-05-08', 20, 100)).toEqual({
      tokensUsed: 100,
      requestsCount: 2,
    });
  });

  it('reserve rejects every call when the cap is 0', async () => {
    expect(await service.reserve('2026-05-08', 1, 0)).toBeNull();
  });

  it('starts from zero on a new date', async () => {
    await service.reserve('2026-05-08', 500);
    const totals = await service.reserve('2026-05-09', 100);
    expect(totals).toEqual({ tokensUsed: 100, requestsCount: 1 });
  });

  it('adjustTokens applies the delta without going below zero', async () => {
    await service.reserve('2026-05-08', 200);
    await service.adjustTokens('2026-05-08', -50);
    expect(await service.reserve('2026-05-08', 0)).toEqual({
      tokensUsed: 150,
      requestsCount: 2,
    });

    await service.adjustTokens('2026-05-08', -1000);
    expect(await service.reserve('2026-05-08', 0)).toEqual({
      tokensUsed: 0,
      requestsCount: 3,
    });
  });

  it('adjustTokens ignores unknown dates', async () => {
    await service.adjustTokens('2026-05-08', 100);
    expect(await service.reserve('2026-05-08', 0)).toEqual({
      tokensUsed: 0,
      requestsCount: 1,
    });
  });
});

describe('PostgresLlmUsageCounter', () => {
  afterEach(async () => {
    await PgMockManager.getInstance().clearDatabase();
  });

  it('shares totals between instances, e.g. after a restart', async () => {
    await newPostgresCounter().reserve('2026-05-08', 80, 100);
    const restarted = newPostgresCounter();
    expect(await restarted.reserve('2026-05-08', 30, 100)).toBeNull();
    expect(await restarted.reserve('2026-05-08', 20, 100)).toEqual({
      tokensUsed: 100,
      requestsCount: 2,
    });
  });

  it('keeps one row per day as usage history', async () => {
    const service = newPostgresCounter();
    await service.reserve('2026-05-08', 500);
    await service.reserve('2026-05-09', 100);

    const { rows } = await PgMockManager.getInstance()
      .getDb()
      .query(
        'SELECT date_usage::text AS date, tokens_used, requests_count FROM llm_usage_counter ORDER BY date_usage',
      );
    expect(rows).toEqual([
      { date: '2026-05-08', tokens_used: 500, requests_count: 1 },
      { date: '2026-05-09', tokens_used: 100, requests_count: 1 },
    ]);
  });

  it('retries creating the table after a failure', async () => {
    const pool = new Pool();
    const query = jest.spyOn(pool, 'query');
    query.mockRejectedValueOnce(new Error('connection refused'));
    const service = new PostgresLlmUsageCounter(pool);

    await expect(service.reserve('2026-05-08', 10)).rejects.toThrow(
      'connection refused',
    );
    expect(await service.reserve('2026-05-08', 10)).toEqual({
      tokensUsed: 10,
      requestsCount: 1,
    });
    query.mockRestore();
  });
});
