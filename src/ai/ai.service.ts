import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  APICallError,
  FinishReason,
  LanguageModel,
  LanguageModelUsage,
  ModelMessage,
  streamText,
} from 'ai';
import { getLLMConfig } from './ai-config';
import { createProvider } from './ai-provider';
import {
  diagramToCodeSystemPrompt,
  diagramToCodeUserPrompt,
  TEXT_TO_DIAGRAM_SYSTEM_PROMPT,
  Theme,
} from './prompts';
import { RateLimitExceededException } from './rate-limit.exception';
import { GenerationLog } from './generation-log';
import {
  currentDateUsage,
  LLM_USAGE_COUNTER,
  LlmUsageCounting,
} from './llm-usage.interface';

export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
export const IMAGE_TOKEN_ESTIMATE = 2000;
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const OUT_OF_TOKENS = 'The model ran out of tokens before producing output.';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface DiagramToCodeRequest {
  texts: string;
  image: string;
  theme: Theme;
}

export type StreamChunk =
  | { type: 'content'; delta: string }
  | {
      type: 'done';
      finishReason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null;
    }
  | { type: 'error'; error: { message: string } };

interface PerMinuteEntry {
  time: number;
  count: number;
}

interface Reservation {
  entry: PerMinuteEntry;
  dateUsage: string;
  estimated: number;
}

interface ParsedLimits {
  tpm: number | undefined;
  rpm: number | undefined;
  tpd: number | undefined;
  maxOutputTokens: number;
  timeoutMs: number;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly llmConfig = getLLMConfig();
  private tokensUsedPerMinute: PerMinuteEntry[] = [];
  private readonly limits: ParsedLimits;

  constructor(
    @Inject(LLM_USAGE_COUNTER)
    private readonly usageCounter: LlmUsageCounting,
  ) {
    this.limits = {
      tpm: AiService.parseLimit(this.llmConfig.tpm),
      rpm: AiService.parseLimit(this.llmConfig.rpm),
      tpd: AiService.parseLimit(this.llmConfig.tpd),
      maxOutputTokens:
        AiService.parsePositive(this.llmConfig.maxOutputTokens) ??
        DEFAULT_MAX_OUTPUT_TOKENS,
      timeoutMs:
        AiService.parsePositive(this.llmConfig.timeoutMs) ??
        DEFAULT_REQUEST_TIMEOUT_MS,
    };
  }

  streamTextToDiagram(
    messages: ChatMessage[],
    abortSignal?: AbortSignal,
  ): Promise<AsyncGenerator<StreamChunk>> {
    return this.stream(
      'text-to-diagram',
      this.llmConfig.model,
      TEXT_TO_DIAGRAM_SYSTEM_PROMPT,
      messages,
      abortSignal,
    );
  }

  streamDiagramToCode(
    { texts, image, theme }: DiagramToCodeRequest,
    abortSignal?: AbortSignal,
  ): Promise<AsyncGenerator<StreamChunk>> {
    return this.stream(
      'diagram-to-code',
      this.llmConfig.visionModel || this.llmConfig.model,
      diagramToCodeSystemPrompt(theme),
      [
        {
          role: 'user',
          content: [
            { type: 'text', text: diagramToCodeUserPrompt(texts) },
            { type: 'image', image },
          ],
        },
      ],
      abortSignal,
    );
  }

  private async stream(
    task: string,
    modelName: string | undefined,
    system: string,
    messages: ModelMessage[],
    abortSignal?: AbortSignal,
  ): Promise<AsyncGenerator<StreamChunk>> {
    const provider = createProvider(this.llmConfig);
    if (!provider || !modelName) {
      throw new ServiceUnavailableException('AI provider is not configured.');
    }

    const estimated = this.estimateTokens(system, messages);
    const reservation = await this.reserveBudget(estimated);
    return this.streamAndBook(
      reservation,
      provider(modelName),
      modelName,
      task,
      system,
      messages,
      abortSignal,
    );
  }

  private async *streamAndBook(
    reservation: Reservation,
    model: LanguageModel,
    modelName: string,
    task: string,
    system: string,
    messages: ModelMessage[],
    abortSignal?: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    const generation = new GenerationLog(
      this.logger,
      task,
      AiService.describeRequest(modelName, messages, reservation.estimated),
    );
    let usage: LanguageModelUsage | undefined;
    let error: unknown;
    let outcome = 'stopped by client';
    let success = false;
    let producedText = false;
    try {
      const result = this.callLlm(
        model,
        system,
        messages,
        generation,
        abortSignal,
      );
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'reasoning-delta':
            generation.reasoning();
            break;
          case 'text-delta':
            generation.text();
            producedText = true;
            yield { type: 'content', delta: part.text };
            break;
          case 'finish':
            usage = part.totalUsage;
            if (part.finishReason === 'length' && !producedText) {
              outcome = 'hit the token limit before producing output';
              success = false;
              yield { type: 'error', error: { message: OUT_OF_TOKENS } };
              break;
            }
            outcome = `finished (${part.finishReason})`;
            success = true;
            yield {
              type: 'done',
              finishReason: AiService.toFinishReason(part.finishReason),
            };
            break;
          case 'error':
            error = part.error;
            outcome = 'failed';
            success = false;
            yield { type: 'error', error: { message: 'Generation failed.' } };
            break;
          case 'abort':
            outcome = abortSignal?.aborted
              ? 'cancelled by client'
              : 'timed out';
            success = false;
            yield { type: 'error', error: { message: 'Generation aborted.' } };
            break;
        }
      }
    } finally {
      const booked = await this.book(reservation, usage, error, generation);
      generation.end(outcome, success, booked);
    }
  }

  private callLlm(
    model: LanguageModel,
    system: string,
    messages: ModelMessage[],
    generation: GenerationLog,
    abortSignal?: AbortSignal,
  ) {
    const timeout = AbortSignal.timeout(this.limits.timeoutMs);
    return streamText({
      model,
      system,
      messages,
      maxOutputTokens: this.limits.maxOutputTokens,
      maxRetries: 0,
      onError: ({ error }) =>
        generation.warn(`LLM call failed: ${AiService.describe(error)}`),
      abortSignal: abortSignal
        ? AbortSignal.any([abortSignal, timeout])
        : timeout,
    });
  }

  private async book(
    reservation: Reservation,
    usage: LanguageModelUsage | undefined,
    error: unknown,
    generation: GenerationLog,
  ): Promise<number> {
    if (error !== undefined && AiService.isUnbilled(error)) {
      await this.refundReservation(reservation);
      return 0;
    }
    const booked = AiService.bookedTokens(usage, reservation.estimated);
    await this.tryCommitReservation(reservation, booked);
    this.logUsage(generation, booked, reservation.estimated, usage);
    return booked;
  }

  private logUsage(
    generation: GenerationLog,
    booked: number,
    estimated: number,
    usage: LanguageModelUsage | undefined,
  ): void {
    generation.debug(
      `LLM call booked ${booked} tokens (estimated ${estimated}, ` +
        `input ${usage?.inputTokens ?? 0}, output ${usage?.outputTokens ?? 0}, ` +
        `reasoning ${usage?.outputTokenDetails?.reasoningTokens ?? 0}, ` +
        `cap ${this.limits.maxOutputTokens})`,
    );
  }

  private estimateTokens(system: string, messages: ModelMessage[]): number {
    const promptTokens = messages.reduce((sum, message) => {
      if (typeof message.content === 'string') {
        return sum + Buffer.byteLength(message.content, 'utf8');
      }
      return (
        sum +
        message.content.reduce((partSum, part) => {
          if (part.type === 'text') {
            return partSum + Buffer.byteLength(part.text, 'utf8');
          }
          return partSum + IMAGE_TOKEN_ESTIMATE;
        }, 0)
      );
    }, 0);
    return (
      Buffer.byteLength(system, 'utf8') +
      promptTokens +
      this.limits.maxOutputTokens
    );
  }

  private static describeRequest(
    modelName: string,
    messages: ModelMessage[],
    estimated: number,
  ): string {
    const images = messages.reduce(
      (count, message) =>
        typeof message.content === 'string'
          ? count
          : count +
            message.content.filter((part) => part.type === 'image').length,
      0,
    );
    return (
      `model ${modelName}, ${messages.length} messages, ${images} images, ` +
      `estimated ${estimated} tokens`
    );
  }

  private static bookedTokens(
    usage: LanguageModelUsage | undefined,
    estimated: number,
  ): number {
    const parts = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
    const reported = Math.max(usage?.totalTokens ?? 0, parts);
    return reported > 0 ? reported : estimated;
  }

  private static toFinishReason(
    reason: FinishReason,
  ): Extract<StreamChunk, { type: 'done' }>['finishReason'] {
    switch (reason) {
      case 'stop':
      case 'length':
        return reason;
      case 'content-filter':
        return 'content_filter';
      case 'tool-calls':
        return 'tool_calls';
      default:
        return null;
    }
  }

  private static isUnbilled(err: unknown): boolean {
    if (!APICallError.isInstance(err)) return false;
    const status = err.statusCode;
    if (status === undefined) return true;
    return status >= 400 && status < 500 && status !== 408 && status !== 429;
  }

  private static describe(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  private static parseLimit(raw: string | undefined): number | undefined {
    if (!raw) return undefined;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : undefined;
  }

  private static parsePositive(raw: string | undefined): number | undefined {
    const value = AiService.parseLimit(raw);
    return value !== undefined && value > 0 ? value : undefined;
  }

  private async refundReservation(reservation: Reservation): Promise<void> {
    this.tokensUsedPerMinute = this.tokensUsedPerMinute.filter(
      (e) => e !== reservation.entry,
    );
    await this.tryCommitReservation(reservation, 0);
  }

  private async reserveBudget(estimated: number): Promise<Reservation> {
    this.checkPerMinuteLimits(estimated);
    const entry: PerMinuteEntry = { time: Date.now(), count: estimated };
    this.tokensUsedPerMinute.push(entry);
    const dateUsage = currentDateUsage();
    try {
      await this.reserveDaily(dateUsage, estimated);
    } catch (err) {
      this.tokensUsedPerMinute = this.tokensUsedPerMinute.filter(
        (e) => e !== entry,
      );
      throw err;
    }
    return { entry, dateUsage, estimated };
  }

  private checkPerMinuteLimits(estimated: number): void {
    this.pruneExpiredEntries();
    const currentTokens = this.tokensUsedPerMinute.reduce(
      (sum, e) => sum + e.count,
      0,
    );
    if (
      this.limits.tpm !== undefined &&
      currentTokens + estimated > this.limits.tpm
    ) {
      throw new RateLimitExceededException('tokens');
    }
    if (
      this.limits.rpm !== undefined &&
      this.tokensUsedPerMinute.length + 1 > this.limits.rpm
    ) {
      throw new RateLimitExceededException('requests');
    }
  }

  private pruneExpiredEntries(): void {
    const oneMinuteAgo = Date.now() - 60_000;
    this.tokensUsedPerMinute = this.tokensUsedPerMinute.filter(
      (e) => e.time > oneMinuteAgo,
    );
  }

  private async reserveDaily(
    dateUsage: string,
    estimated: number,
  ): Promise<void> {
    const totals = await this.usageCounter.reserve(
      dateUsage,
      estimated,
      this.limits.tpd,
    );
    if (totals === null) {
      throw new RateLimitExceededException('tokens');
    }
  }

  private async tryCommitReservation(
    reservation: Reservation,
    actual: number,
  ): Promise<void> {
    reservation.entry.count = actual;
    try {
      await this.usageCounter.adjustTokens(
        reservation.dateUsage,
        actual - reservation.estimated,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to reconcile actual tokens for ${reservation.dateUsage}; keeping conservative reservation. ${AiService.describe(err)}`,
      );
    }
  }
}
