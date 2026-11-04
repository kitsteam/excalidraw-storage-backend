import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Res,
  UseFilters,
} from '@nestjs/common';
import { Response } from 'express';
import * as v from 'valibot';
import { AiService, StreamChunk } from './ai.service';
import { RateLimitExceptionFilter } from './rate-limit-exception.filter';

const MAX_MESSAGES = 50;
const MAX_TEXT_LENGTH = 10_000;

const TextToDiagramSchema = v.object({
  messages: v.pipe(
    v.array(
      v.object({
        role: v.picklist(['user', 'assistant']),
        content: v.pipe(
          v.string(),
          v.minLength(1),
          v.maxLength(MAX_TEXT_LENGTH),
        ),
      }),
    ),
    v.minLength(1),
    v.maxLength(MAX_MESSAGES),
  ),
});

const DiagramToCodeSchema = v.object({
  texts: v.pipe(v.string(), v.maxLength(MAX_TEXT_LENGTH)),
  image: v.pipe(v.string(), v.startsWith('data:image/')),
  theme: v.picklist(['light', 'dark']),
});

const parse = <T extends v.GenericSchema>(
  schema: T,
  body: unknown,
): v.InferOutput<T> => {
  const result = v.safeParse(schema, body);
  if (!result.success) {
    throw new BadRequestException(v.summarize(result.issues));
  }
  return result.output;
};

const abortOnClose = (res: Response): AbortSignal => {
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  return controller.signal;
};

@UseFilters(RateLimitExceptionFilter)
@Controller('v1/ai')
export class AiController {
  constructor(private aiService: AiService) {}

  @Post('text-to-diagram/chat-streaming')
  async textToDiagram(@Body() body: unknown, @Res() res: Response) {
    const { messages } = parse(TextToDiagramSchema, body);
    const stream = await this.aiService.streamTextToDiagram(
      messages,
      abortOnClose(res),
    );
    await AiController.writeEvents(res, stream);
  }

  @Post('diagram-to-code/generate-streaming')
  async diagramToCode(@Body() body: unknown, @Res() res: Response) {
    const request = parse(DiagramToCodeSchema, body);
    const stream = await this.aiService.streamDiagramToCode(
      request,
      abortOnClose(res),
    );
    await AiController.writeEvents(res, stream);
  }

  private static async writeEvents(
    res: Response,
    stream: AsyncGenerator<StreamChunk>,
  ): Promise<void> {
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    try {
      for await (const chunk of stream) {
        if (res.destroyed) break;
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.write('data: [DONE]\n\n');
    } finally {
      res.end();
    }
  }
}
