import { LlmUsageCounterService } from './llm-usage-counter.service';

describe('LlmUsageCounterService', () => {
  let service: LlmUsageCounterService;

  beforeEach(() => {
    service = new LlmUsageCounterService();
  });

  it('produces UTC date keys independent of locale', () => {
    const dateUsage = LlmUsageCounterService.currentDateUsage(
      new Date('2026-05-08T23:30:00Z'),
    );
    expect(dateUsage).toBe('2026-05-08');
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
