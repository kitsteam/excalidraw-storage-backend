import { OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { LlmUsageCounting, UsageTotals } from './llm-usage.interface';

interface UsageRow {
  tokens_used: string | number;
  requests_count: string | number;
}

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS llm_usage_counter (
  date_usage date PRIMARY KEY,
  tokens_used bigint NOT NULL DEFAULT 0,
  requests_count bigint NOT NULL DEFAULT 0
)`;

// The cap check sits inside the upsert, so concurrent requests (also across
// instances) cannot both pass a "would I exceed?" check.
const RESERVE = `INSERT INTO llm_usage_counter (date_usage, tokens_used, requests_count)
  SELECT $1::date, $2::bigint, 1
  WHERE $3::bigint IS NULL OR $2::bigint <= $3::bigint
  ON CONFLICT (date_usage) DO UPDATE
    SET tokens_used = llm_usage_counter.tokens_used + EXCLUDED.tokens_used,
        requests_count = llm_usage_counter.requests_count + 1
    WHERE $3::bigint IS NULL
          OR llm_usage_counter.tokens_used + EXCLUDED.tokens_used <= $3::bigint
  RETURNING tokens_used, requests_count`;

const ADJUST = `UPDATE llm_usage_counter
  SET tokens_used = GREATEST(0, tokens_used + $2::bigint)
  WHERE date_usage = $1::date`;

/**
 * Anonymized per-day totals in the STORAGE_URI database, so the daily token
 * cap survives restarts and is shared by all instances. The table is created
 * on first use; one row per day is kept as usage history.
 */
export class PostgresLlmUsageCounter
  implements LlmUsageCounting, OnModuleDestroy
{
  private tableReady?: Promise<void>;

  constructor(private readonly pool: Pool) {}

  async reserve(
    dateUsage: string,
    tokens: number,
    cap?: number,
  ): Promise<UsageTotals | null> {
    await this.ensureTable();
    const { rows } = await this.pool.query<UsageRow>(RESERVE, [
      dateUsage,
      tokens,
      cap ?? null,
    ]);
    if (rows.length === 0) return null;
    return {
      tokensUsed: Number(rows[0].tokens_used),
      requestsCount: Number(rows[0].requests_count),
    };
  }

  async adjustTokens(dateUsage: string, delta: number): Promise<void> {
    if (delta === 0) return;
    await this.ensureTable();
    await this.pool.query(ADJUST, [dateUsage, delta]);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  private ensureTable(): Promise<void> {
    this.tableReady ??= this.pool.query(CREATE_TABLE).then(
      () => undefined,
      (err: unknown) => {
        // Retry on the next request instead of caching the failure.
        this.tableReady = undefined;
        throw err;
      },
    );
    return this.tableReady;
  }
}
