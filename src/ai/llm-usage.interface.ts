export interface UsageTotals {
  tokensUsed: number;
  requestsCount: number;
}

/**
 * Daily token budget store. Implemented in memory and in Postgres.
 */
export interface LlmUsageCounting {
  reserve(
    dateUsage: string,
    tokens: number,
    cap?: number,
  ): Promise<UsageTotals | null>;
  adjustTokens(dateUsage: string, delta: number): Promise<void>;
}

/**
 * Injection token for the LlmUsageCounting implementation.
 */
export const LLM_USAGE_COUNTER = Symbol('LLM_USAGE_COUNTER');

/**
 * UTC date key (YYYY-MM-DD), locale-independent.
 */
export const currentDateUsage = (now: Date = new Date()): string =>
  now.toISOString().slice(0, 10);
