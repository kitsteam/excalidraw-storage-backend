import { Logger, Module, Provider } from '@nestjs/common';
import { Pool } from 'pg';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { InMemoryLlmUsageCounter } from './in-memory-llm-usage-counter.service';
import { LLM_USAGE_COUNTER, LlmUsageCounting } from './llm-usage.interface';
import { PostgresLlmUsageCounter } from './postgres-llm-usage-counter.service';

const logger = new Logger('AiModule');

const usageCounterProvider: Provider = {
  provide: LLM_USAGE_COUNTER,
  useFactory: (): LlmUsageCounting => {
    const uri = process.env['STORAGE_URI'];
    if (uri) {
      return new PostgresLlmUsageCounter(new Pool({ connectionString: uri }));
    }
    logger.warn(
      'STORAGE_URI is undefined, the daily token cap is kept in memory and resets on restart',
    );
    return new InMemoryLlmUsageCounter();
  },
};

@Module({
  controllers: [AiController],
  providers: [AiService, usageCounterProvider],
})
export class AiModule {}
