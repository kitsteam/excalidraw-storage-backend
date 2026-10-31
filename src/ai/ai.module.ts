import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { LlmUsageCounterService } from './llm-usage-counter.service';

@Module({
  controllers: [AiController],
  providers: [AiService, LlmUsageCounterService],
})
export class AiModule {}
