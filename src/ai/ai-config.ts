export interface LLMProps {
  url?: string;
  token?: string;
  provider?: string;
  model?: string;
  tpm?: string;
  tpd?: string;
  rpm?: string;
  maxOutputTokens?: string;
  timeoutMs?: string;
}

export const isAiEnabled = (): boolean =>
  process.env['AI_ENABLED']?.toLowerCase() === 'true';

export const getAiPort = (): string => process.env['AI_PORT'] ?? '8081';

export const getLLMConfig = (): LLMProps => ({
  url: process.env['AI_LLM_URL'],
  token: process.env['AI_LLM_TOKEN'],
  provider: process.env['AI_LLM_PROVIDER'] ?? 'openai',
  model: process.env['AI_LLM_MODEL'],
  tpm: process.env['AI_LLM_TPM'],
  tpd: process.env['AI_LLM_TPD'],
  rpm: process.env['AI_LLM_RPM'],
  maxOutputTokens: process.env['AI_LLM_MAX_OUTPUT_TOKENS'],
  timeoutMs: process.env['AI_LLM_TIMEOUT_MS'],
});
