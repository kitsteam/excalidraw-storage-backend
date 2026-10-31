import {
  createOpenAICompatible,
  OpenAICompatibleProvider,
} from '@ai-sdk/openai-compatible';
import { OpenAIProvider, createOpenAI } from '@ai-sdk/openai';
import { LLMProps } from './ai-config';

const PROVIDER_OPENAI_COMPATIBLE = 'openai-compatible';

type SupportedProvider = OpenAIProvider | OpenAICompatibleProvider;

const createOpenAICompatibleProvider = (
  llmConfig: LLMProps,
): OpenAICompatibleProvider | undefined => {
  if (!llmConfig.url) return;

  return createOpenAICompatible({
    baseURL: llmConfig.url,
    name: llmConfig.provider ?? PROVIDER_OPENAI_COMPATIBLE,
    includeUsage: true,
    headers: llmConfig.token
      ? { Authorization: `Bearer ${llmConfig.token}` }
      : undefined,
  });
};

const createDefaultProvider = (
  llmConfig: LLMProps,
): OpenAIProvider | undefined => {
  if (!llmConfig.token) return;

  return createOpenAI({
    apiKey: llmConfig.token,
  });
};

export const createProvider = (
  llmConfig: LLMProps,
): SupportedProvider | undefined =>
  llmConfig.provider === PROVIDER_OPENAI_COMPATIBLE
    ? createOpenAICompatibleProvider(llmConfig)
    : createDefaultProvider(llmConfig);
