import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { APICallError } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import {
  AiService,
  DEFAULT_MAX_OUTPUT_TOKENS,
  IMAGE_TOKEN_ESTIMATE,
  StreamChunk,
} from './ai.service';
import {
  diagramToCodeSystemPrompt,
  diagramToCodeUserPrompt,
  TEXT_TO_DIAGRAM_SYSTEM_PROMPT,
} from './prompts';
import type { LlmUsageCounting } from './llm-usage.interface';
import { RateLimitExceededException } from './rate-limit.exception';
import * as aiProvider from './ai-provider';
import * as aiConfig from './ai-config';
import type { LLMProps } from './ai-config';

type CreateProviderMock = jest.MockedFunction<typeof aiProvider.createProvider>;
type GetLLMConfigMock = jest.MockedFunction<typeof aiConfig.getLLMConfig>;
type DoStreamResult = Awaited<ReturnType<MockLanguageModelV3['doStream']>>;
type FinishReason = 'stop' | 'length' | 'content-filter' | 'error' | 'other';

jest.mock('./ai-provider');
jest.mock('./ai-config');

const estimateFor = (
  content: string,
  maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
) =>
  Buffer.byteLength(TEXT_TO_DIAGRAM_SYSTEM_PROMPT, 'utf8') +
  Buffer.byteLength(content, 'utf8') +
  maxOutputTokens;

const apiError = (statusCode: number | undefined) =>
  new APICallError({
    message: 'provider error',
    url: 'localhost:3000',
    requestBodyValues: {},
    statusCode,
  });

const streamResult = (
  text: string,
  {
    usage = [100, 400] as [number | undefined, number | undefined],
    finishReason = 'stop' as FinishReason,
  } = {},
): DoStreamResult => {
  const [inputTokens, outputTokens] = usage;
  return {
    stream: convertArrayToReadableStream([
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: '1' },
      { type: 'text-delta', id: '1', delta: text },
      { type: 'text-end', id: '1' },
      {
        type: 'finish',
        finishReason: { unified: finishReason, raw: finishReason },
        usage: {
          inputTokens: {
            total: inputTokens,
            noCache: inputTokens,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: outputTokens,
            text: outputTokens,
            reasoning: undefined,
          },
        },
      },
    ]),
  };
};

const collect = async (stream: AsyncGenerator<StreamChunk>) => {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
};

interface FakeUsageState {
  tokensUsed: number;
  requestsCount: number;
}

const buildUsageCounterMock = (
  state: FakeUsageState,
): jest.Mocked<LlmUsageCounting> => ({
  reserve: jest.fn(async (_dateUsage: string, tokens: number, cap?: number) => {
    const proposed = state.tokensUsed + tokens;
    if (cap !== undefined && proposed > cap) return null;
    state.tokensUsed = proposed;
    state.requestsCount += 1;
    return {
      tokensUsed: state.tokensUsed,
      requestsCount: state.requestsCount,
    };
  }),
  adjustTokens: jest.fn(async (_dateUsage: string, delta: number) => {
    state.tokensUsed = Math.max(0, state.tokensUsed + delta);
  }),
});

describe('AiService', () => {
  let aiService: AiService;
  let model: MockLanguageModelV3;
  let provider: jest.Mock;
  let doStream: jest.Mock<Promise<DoStreamResult>>;
  let createProviderMock: CreateProviderMock;
  let getLLMConfigMock: GetLLMConfigMock;
  let usageState: FakeUsageState;
  let usageCounter: jest.Mocked<LlmUsageCounting>;

  const configure = (config: LLMProps) => {
    getLLMConfigMock.mockReturnValue(config);
    aiService = new AiService(usageCounter);
  };

  const textToDiagram = async (content = 'short') =>
    collect(await aiService.streamTextToDiagram([{ role: 'user', content }]));

  beforeAll(() => {
    jest.useFakeTimers({ advanceTimers: true });
  });

  beforeEach(() => {
    jest.clearAllMocks();

    createProviderMock = aiProvider.createProvider as CreateProviderMock;
    getLLMConfigMock = aiConfig.getLLMConfig as GetLLMConfigMock;

    doStream = jest.fn(async () => streamResult('flowchart TD'));
    model = new MockLanguageModelV3({ doStream });
    provider = jest.fn(() => model);
    createProviderMock.mockReturnValue(
      provider as unknown as ReturnType<typeof aiProvider.createProvider>,
    );

    usageState = { tokensUsed: 0, requestsCount: 0 };
    usageCounter = buildUsageCounterMock(usageState);
    configure({
      url: 'localhost:3000',
      token: 'test-token',
      provider: 'openai',
      model: 'gpt-4',
      tpm: '10000',
      rpm: '5',
      tpd: '100000',
    });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe('token estimate', () => {
    const reserved = () => usageCounter.reserve.mock.calls[0][1];

    it('counts every byte of the system prompt and messages plus the output cap', async () => {
      await textToDiagram('hello');

      expect(reserved()).toBe(estimateFor('hello'));
    });

    it('counts a multi-byte character as several tokens', async () => {
      await textToDiagram('漢字');

      expect(reserved()).toBe(estimateFor('') + 6);
    });

    it('counts every message of the conversation', async () => {
      await collect(
        await aiService.streamTextToDiagram([
          { role: 'user', content: 'abc' },
          { role: 'assistant', content: 'de' },
        ]),
      );

      expect(reserved()).toBe(estimateFor('abcde'));
    });

    it('counts an image with a fixed estimate', async () => {
      await collect(
        await aiService.streamDiagramToCode({
          texts: 'Login',
          image: 'data:image/jpeg;base64,AAAA',
          theme: 'dark',
        }),
      );

      expect(reserved()).toBe(
        Buffer.byteLength(diagramToCodeSystemPrompt('dark'), 'utf8') +
          Buffer.byteLength(diagramToCodeUserPrompt('Login'), 'utf8') +
          IMAGE_TOKEN_ESTIMATE +
          DEFAULT_MAX_OUTPUT_TOKENS,
      );
    });

    it('reserves the full configured output cap', async () => {
      configure({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        maxOutputTokens: '1000',
      });

      await textToDiagram('hello');

      expect(reserved()).toBe(estimateFor('hello', 1000));
    });

    it('falls back to the default output cap when the configured one is 0', async () => {
      configure({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        maxOutputTokens: '0',
      });

      await textToDiagram('hello');

      expect(reserved()).toBe(estimateFor('hello'));
    });
  });

  describe('streamTextToDiagram', () => {
    it('streams content deltas followed by the finish reason', async () => {
      const chunks = await textToDiagram();

      expect(chunks).toEqual([
        { type: 'content', delta: 'flowchart TD' },
        { type: 'done', finishReason: 'stop' },
      ]);
    });

    it.each([
      ['length', 'length'],
      ['content-filter', 'content_filter'],
      ['other', null],
    ] as const)(
      'maps the finish reason %s to %s',
      async (finishReason, expected) => {
        doStream.mockResolvedValueOnce(
          streamResult('flowchart TD', { finishReason }),
        );

        const chunks = await textToDiagram();

        expect(chunks.at(-1)).toEqual({
          type: 'done',
          finishReason: expected,
        });
      },
    );

    it('forwards system prompt, messages and abort signal to the model', async () => {
      await collect(
        await aiService.streamTextToDiagram([
          { role: 'user', content: 'cats' },
          { role: 'assistant', content: 'flowchart TD' },
        ]),
      );

      const options = doStream.mock.calls[0][0];
      expect(options.prompt).toEqual([
        { role: 'system', content: TEXT_TO_DIAGRAM_SYSTEM_PROMPT },
        { role: 'user', content: [{ type: 'text', text: 'cats' }] },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'flowchart TD' }],
        },
      ]);
      expect(options.abortSignal).toBeInstanceOf(AbortSignal);
    });

    it('aborts the model call when the caller aborts', async () => {
      const controller = new AbortController();
      await collect(
        await aiService.streamTextToDiagram(
          [{ role: 'user', content: 'cats' }],
          controller.signal,
        ),
      );

      controller.abort();

      expect(doStream.mock.calls[0][0].abortSignal.aborted).toBe(true);
    });

    it('streams an error chunk and keeps the estimate booked when the call times out', async () => {
      configure({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        timeoutMs: '1',
      });
      doStream.mockImplementationOnce(
        ({ abortSignal }) =>
          new Promise((_resolve, reject) =>
            abortSignal.addEventListener('abort', () =>
              reject(abortSignal.reason),
            ),
          ),
      );

      expect(await textToDiagram('short')).toEqual([
        { type: 'error', error: { message: 'Generation aborted.' } },
      ]);
      expect(usageState.tokensUsed).toBe(estimateFor('short'));
    });

    it('streams an error chunk when the token limit is hit before any text', async () => {
      doStream.mockResolvedValueOnce({
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'reasoning-start', id: 'r' },
          { type: 'reasoning-delta', id: 'r', delta: 'thinking' },
          {
            type: 'finish',
            finishReason: { unified: 'length', raw: 'length' },
            usage: {
              inputTokens: {
                total: 100,
                noCache: 100,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 400, text: 0, reasoning: 400 },
            },
          },
        ]),
      });

      expect(await textToDiagram('short')).toEqual([
        {
          type: 'error',
          error: {
            message: 'The model ran out of tokens before producing output.',
          },
        },
      ]);
      expect(usageState.tokensUsed).toBe(500);
    });

    it('keeps partial output when the token limit is hit after some text', async () => {
      doStream.mockResolvedValueOnce(
        streamResult('flowchart TD', { finishReason: 'length' }),
      );

      expect(await textToDiagram('short')).toEqual([
        { type: 'content', delta: 'flowchart TD' },
        { type: 'done', finishReason: 'length' },
      ]);
    });

    it('turns off SDK retries so one reservation pays for one attempt', async () => {
      doStream.mockRejectedValueOnce(apiError(500));

      await textToDiagram();

      expect(doStream).toHaveBeenCalledTimes(1);
    });

    it('forwards configured maxOutputTokens to the model', async () => {
      configure({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        maxOutputTokens: '256',
      });

      await textToDiagram('hi');

      expect(doStream.mock.calls[0][0].maxOutputTokens).toBe(256);
    });

    it('leaves a reasoning model room to think when no cap is configured', async () => {
      configure({
        url: 'localhost:3000',
        provider: 'openai-compatible',
        model: 'qwen3',
      });

      await textToDiagram('hi');

      expect(doStream.mock.calls[0][0].maxOutputTokens).toBe(
        DEFAULT_MAX_OUTPUT_TOKENS,
      );
    });

    it('rejects when provider is not configured', async () => {
      createProviderMock.mockReturnValueOnce(undefined);

      await expect(textToDiagram()).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(doStream).not.toHaveBeenCalled();
    });

    it('rejects when model is not configured', async () => {
      configure({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: undefined,
      });

      await expect(textToDiagram()).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(doStream).not.toHaveBeenCalled();
    });
  });

  describe('logging', () => {
    let log: jest.SpyInstance;
    let warn: jest.SpyInstance;

    const lines = (spy: jest.SpyInstance): string[] =>
      spy.mock.calls.map(([message]) => message);

    beforeEach(() => {
      log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    });

    afterEach(() => {
      log.mockRestore();
      warn.mockRestore();
    });

    it('logs the start and the successful end of a generation', async () => {
      await textToDiagram('short');

      expect(lines(log)).toEqual([
        expect.stringMatching(
          new RegExp(
            `text-to-diagram started \\(model gpt-4, 1 messages, 0 images, estimated ${estimateFor('short')} tokens\\)$`,
          ),
        ),
        expect.stringMatching(
          /text-to-diagram finished \(stop\) after \d+\.\ds \(booked 500 tokens\)$/,
        ),
      ]);
    });

    it('counts the image of a diagram-to-code request', async () => {
      await collect(
        await aiService.streamDiagramToCode({
          texts: '',
          image: 'data:image/png;base64,AAAA',
          theme: 'light',
        }),
      );

      expect(lines(log)[0]).toMatch(
        /diagram-to-code started \(model gpt-4, 1 messages, 1 images,/,
      );
    });

    it('logs a client cancellation as a warning', async () => {
      const controller = new AbortController();
      doStream.mockImplementationOnce(({ abortSignal }) => {
        controller.abort();
        return Promise.reject(abortSignal.reason);
      });

      await collect(
        await aiService.streamTextToDiagram(
          [{ role: 'user', content: 'short' }],
          controller.signal,
        ),
      );

      expect(lines(warn)).toEqual([
        expect.stringMatching(/text-to-diagram cancelled by client after/),
      ]);
    });

    it('logs a timeout as a warning', async () => {
      configure({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        timeoutMs: '1',
      });
      doStream.mockImplementationOnce(
        ({ abortSignal }) =>
          new Promise((_resolve, reject) =>
            abortSignal.addEventListener('abort', () =>
              reject(abortSignal.reason),
            ),
          ),
      );

      await textToDiagram('short');

      expect(lines(warn)).toEqual([
        expect.stringMatching(/text-to-diagram timed out after/),
      ]);
    });

    it('logs a failed generation with the provider error', async () => {
      doStream.mockRejectedValueOnce(apiError(401));

      await textToDiagram('short');

      expect(lines(warn)).toEqual([
        expect.stringMatching(/^\[ai#\d+\] LLM call failed: provider error$/),
        expect.stringMatching(
          /text-to-diagram failed after \d+\.\ds \(booked 0 tokens\)$/,
        ),
      ]);
    });
  });

  describe('streamDiagramToCode', () => {
    const image = 'data:image/jpeg;base64,AAAA';

    it('sends the wireframe image together with the escaped texts', async () => {
      await collect(
        await aiService.streamDiagramToCode({
          texts: 'a </texts> & <b>',
          image,
          theme: 'light',
        }),
      );

      const [system, user] = doStream.mock.calls[0][0].prompt;
      expect(system).toEqual({
        role: 'system',
        content: diagramToCodeSystemPrompt('light'),
      });
      expect(user.content).toEqual([
        {
          type: 'text',
          text: expect.stringContaining(
            '<texts>a &lt;/texts&gt; &amp; &lt;b&gt;</texts>',
          ),
        },
        expect.objectContaining({ type: 'file', mediaType: 'image/jpeg' }),
      ]);
    });

    it('uses the main model when no vision model is configured', async () => {
      await collect(
        await aiService.streamDiagramToCode({
          texts: '',
          image,
          theme: 'light',
        }),
      );

      expect(provider).toHaveBeenCalledWith('gpt-4');
    });

    it('uses the vision model when configured', async () => {
      configure({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        visionModel: 'gpt-4o',
      });

      await collect(
        await aiService.streamDiagramToCode({
          texts: '',
          image,
          theme: 'light',
        }),
      );
      await textToDiagram();

      expect(provider.mock.calls).toEqual([['gpt-4o'], ['gpt-4']]);
    });

    it('streams with the vision model alone when no main model is configured', async () => {
      configure({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        visionModel: 'gpt-4o',
      });

      await collect(
        await aiService.streamDiagramToCode({
          texts: '',
          image,
          theme: 'light',
        }),
      );

      expect(provider).toHaveBeenCalledWith('gpt-4o');
      await expect(textToDiagram()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('writes the theme into the system prompt', async () => {
      await collect(
        await aiService.streamDiagramToCode({
          texts: '',
          image,
          theme: 'dark',
        }),
      );

      expect(doStream.mock.calls[0][0].prompt[0].content).toContain(
        'Use a dark color scheme.',
      );
    });
  });

  describe('rate limits', () => {
    it('rejects atomically when TPD would be exceeded (no row written)', async () => {
      configure({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpd: String(estimateFor('short') + 50),
      });

      doStream.mockResolvedValueOnce(
        streamResult('first', { usage: [50, 50] }),
      );
      await textToDiagram('short');

      await expect(textToDiagram('short')).rejects.toThrow(
        RateLimitExceededException,
      );

      expect(usageState).toEqual({ tokensUsed: 100, requestsCount: 1 });
    });

    it('allows a reservation that reaches the TPD cap exactly', async () => {
      configure({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpd: String(estimateFor('short')),
      });

      await textToDiagram('short');
      expect(usageCounter.reserve).toHaveBeenCalledWith(
        expect.any(String),
        estimateFor('short'),
        estimateFor('short'),
      );
    });

    it('rejects every call when TPD is 0', async () => {
      configure({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpd: '0',
      });

      await expect(textToDiagram()).rejects.toThrow(RateLimitExceededException);
      expect(doStream).not.toHaveBeenCalled();
    });

    it('rejects every call when TPM is 0', async () => {
      configure({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: '0',
      });

      await expect(textToDiagram()).rejects.toThrow(RateLimitExceededException);
      expect(doStream).not.toHaveBeenCalled();
    });

    it('reconciles billed tokens via adjustTokens with the correct delta', async () => {
      doStream.mockResolvedValueOnce(
        streamResult('response', { usage: [50, 50] }),
      );
      await textToDiagram('short');

      expect(usageCounter.adjustTokens).toHaveBeenCalledWith(
        expect.any(String),
        100 - estimateFor('short'),
      );
    });

    it('keeps the estimate when the provider reports no usage', async () => {
      doStream.mockResolvedValueOnce(
        streamResult('response', { usage: [undefined, undefined] }),
      );
      await textToDiagram('short');

      expect(usageState.tokensUsed).toBe(estimateFor('short'));
    });

    it('keeps the estimate when the provider reports a total of 0', async () => {
      doStream.mockResolvedValueOnce(
        streamResult('response', { usage: [0, 0] }),
      );
      await textToDiagram('short');

      expect(usageState.tokensUsed).toBe(estimateFor('short'));
    });

    it('keeps the conservative reservation when adjustTokens fails after a successful LLM call', async () => {
      usageCounter.adjustTokens.mockRejectedValueOnce(new Error('db hiccup'));

      await textToDiagram('short');

      expect(usageState.tokensUsed).toBe(estimateFor('short'));
    });

    it('keeps the estimate booked when the client stops reading early', async () => {
      const stream = await aiService.streamTextToDiagram([
        { role: 'user', content: 'short' },
      ]);
      await stream.next();
      await stream.return(undefined);

      expect(usageState).toEqual({
        tokensUsed: estimateFor('short'),
        requestsCount: 1,
      });
    });

    it('streams an error chunk and keeps the estimate booked when the model fails', async () => {
      doStream.mockRejectedValueOnce(new Error('boom'));

      const chunks = await textToDiagram('short');

      expect(chunks).toEqual([
        { type: 'error', error: { message: 'Generation failed.' } },
      ]);
      expect(usageState).toEqual({
        tokensUsed: estimateFor('short'),
        requestsCount: 1,
      });
    });

    it.each([
      ['a 401', 401],
      ['a 400', 400],
      ['a failed connection', undefined],
    ])('refunds the reservation after %s', async (_label, statusCode) => {
      configure({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        rpm: '1',
      });

      doStream.mockRejectedValueOnce(apiError(statusCode));
      const chunks = await textToDiagram('short');
      expect(chunks.at(-1)?.type).toBe('error');
      expect(usageState.tokensUsed).toBe(0);

      await textToDiagram('short');
    });

    it.each([408, 429, 500, 503])(
      'keeps the reservation after a %i',
      async (statusCode) => {
        doStream.mockRejectedValueOnce(apiError(statusCode));
        await textToDiagram('short');

        expect(usageState.tokensUsed).toBe(estimateFor('short'));
      },
    );

    it('throws an error if the tokens per minute limit is reached', async () => {
      configure({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: String(estimateFor('short') + 500),
      });

      doStream.mockResolvedValueOnce(
        streamResult('first', { usage: [300, 500] }),
      );
      await textToDiagram('short');

      await expect(textToDiagram('short')).rejects.toThrow(
        RateLimitExceededException,
      );
    });

    it('throws an error if the requests per minute limit is reached', async () => {
      configure({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        rpm: '3',
      });

      for (let i = 0; i < 3; i++) {
        await textToDiagram(`request ${i}`);
      }

      await expect(textToDiagram('fourth request')).rejects.toThrow(
        RateLimitExceededException,
      );
      await expect(textToDiagram('fourth request')).rejects.toThrow(
        'Request limit exceeded.',
      );
    });

    it('reserves tokens before streaming so concurrent callers see the precharge', async () => {
      configure({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: String(2 * estimateFor('short') - 1),
      });

      let release!: () => void;
      const block = new Promise<void>((resolve) => {
        release = resolve;
      });
      doStream.mockImplementationOnce(async () => {
        await block;
        return streamResult('slow', { usage: [50, 50] });
      });

      const first = textToDiagram('short');
      await expect(textToDiagram('short')).rejects.toThrow(
        RateLimitExceededException,
      );
      release();
      await first;
    });

    it('counts a failed call against the per-minute limits', async () => {
      configure({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        rpm: '1',
      });

      doStream.mockRejectedValueOnce(new Error('boom'));
      await textToDiagram('short');

      await expect(textToDiagram('short')).rejects.toThrow(
        RateLimitExceededException,
      );
    });

    it('resets token count after one minute', async () => {
      configure({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: String(estimateFor('short') + 500),
      });

      doStream.mockResolvedValueOnce(
        streamResult('first', { usage: [300, 500] }),
      );
      await textToDiagram('short');

      await expect(textToDiagram('short')).rejects.toThrow(
        RateLimitExceededException,
      );

      jest.advanceTimersByTime(61000);

      await textToDiagram('short');
    });

    it('uses input length for token estimation in rate limiting', async () => {
      configure({
        url: 'localhost:3000',
        token: 'test-token',
        provider: 'openai',
        model: 'gpt-4',
        tpm: String(estimateFor('') + 1000),
      });

      await expect(textToDiagram('a'.repeat(2000))).rejects.toThrow(
        RateLimitExceededException,
      );
    });
  });
});
