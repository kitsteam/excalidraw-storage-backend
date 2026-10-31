import { Injectable } from '@nestjs/common';

export interface UsageTotals {
  tokensUsed: number;
  requestsCount: number;
}

export interface LlmUsageCounting {
  reserve(
    dateUsage: string,
    tokens: number,
    cap?: number,
  ): Promise<UsageTotals | null>;
  adjustTokens(dateUsage: string, delta: number): Promise<void>;
}

@Injectable()
export class LlmUsageCounterService implements LlmUsageCounting {
  private readonly totals = new Map<string, UsageTotals>();

  static currentDateUsage(now: Date = new Date()): string {
    return now.toISOString().slice(0, 10);
  }

  async reserve(
    dateUsage: string,
    tokens: number,
    cap?: number,
  ): Promise<UsageTotals | null> {
    this.dropOtherDates(dateUsage);
    const current = this.totals.get(dateUsage) ?? {
      tokensUsed: 0,
      requestsCount: 0,
    };
    const tokensUsed = current.tokensUsed + tokens;
    if (cap !== undefined && tokensUsed > cap) return null;

    const updated = { tokensUsed, requestsCount: current.requestsCount + 1 };
    this.totals.set(dateUsage, updated);
    return { ...updated };
  }

  async adjustTokens(dateUsage: string, delta: number): Promise<void> {
    const current = this.totals.get(dateUsage);
    if (!current || delta === 0) return;
    current.tokensUsed = Math.max(0, current.tokensUsed + delta);
  }

  private dropOtherDates(dateUsage: string): void {
    for (const key of this.totals.keys()) {
      if (key !== dateUsage) this.totals.delete(key);
    }
  }
}
