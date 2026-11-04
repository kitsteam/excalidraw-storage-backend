import { Logger } from '@nestjs/common';

export const HEARTBEAT_INTERVAL_MS = 10_000;

let nextId = 1;

/**
 * Logs the lifecycle of one LLM generation: start, first token, a periodic
 * heartbeat while the model is still working, and the outcome. A short id
 * ties the lines of one request together when several run concurrently.
 */
export class GenerationLog {
  private readonly prefix = `[ai#${nextId++}]`;
  private readonly startedAt = Date.now();
  private readonly heartbeat: NodeJS.Timeout;
  private textChunks = 0;
  private reasoningChunks = 0;

  constructor(
    private readonly logger: Logger,
    private readonly task: string,
    details: string,
  ) {
    this.logger.log(`${this.prefix} ${task} started (${details})`);
    this.heartbeat = setInterval(
      () => this.logProgress(),
      HEARTBEAT_INTERVAL_MS,
    );
    this.heartbeat.unref();
  }

  text(): void {
    if (this.textChunks++ === 0) {
      this.debug(`first token after ${this.elapsed()}`);
    }
  }

  reasoning(): void {
    this.reasoningChunks++;
  }

  debug(message: string): void {
    this.logger.debug(`${this.prefix} ${message}`);
  }

  warn(message: string): void {
    this.logger.warn(`${this.prefix} ${message}`);
  }

  end(outcome: string, success: boolean, bookedTokens: number): void {
    clearInterval(this.heartbeat);
    const message =
      `${this.prefix} ${this.task} ${outcome} after ${this.elapsed()} ` +
      `(booked ${bookedTokens} tokens)`;
    if (success) {
      this.logger.log(message);
    } else {
      this.logger.warn(message);
    }
  }

  private logProgress(): void {
    this.debug(
      `still generating after ${this.elapsed()} ` +
        `(${this.textChunks} text chunks, ${this.reasoningChunks} reasoning chunks)`,
    );
  }

  private elapsed(): string {
    return `${((Date.now() - this.startedAt) / 1000).toFixed(1)}s`;
  }
}
