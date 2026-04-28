import type { ModelProvider } from '@/types';

/** 统一的聊天消息格式 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 统一的LLM调用结果 */
export interface LLMResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
}

/** 预设的Provider配置 */
export const PRESET_PROVIDERS: Omit<ModelProvider, 'id' | 'apiKey'>[] = [
  {
    name: 'DeepSeek',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-v3.2', 'deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-v3.2',
  },
  {
    name: 'OpenAI',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
    defaultModel: 'gpt-4o-mini',
  },
  {
    name: 'Claude',
    provider: 'claude',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'],
    defaultModel: 'claude-sonnet-4-20250514',
  },
  {
    name: 'Gemini',
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-2.0-flash', 'gemini-2.5-flash-preview-05-20'],
    defaultModel: 'gemini-2.0-flash',
  },
  {
    name: '智谱 (GLM)',
    provider: 'zhipu',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-flash', 'glm-4-air', 'glm-4-plus', 'glm-4'],
    defaultModel: 'glm-4-flash',
  },
];

/**
 * 调用LLM API —— 统一入口
 * 根据provider类型走不同的请求格式
 */
export async function callLLM(
  provider: ModelProvider,
  messages: LLMMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<LLMResponse> {
  const { provider: type, apiKey, baseUrl, defaultModel } = provider;
  const model = defaultModel;
  const temperature = options?.temperature ?? 0.7;
  const maxTokens = options?.maxTokens ?? 4096;

  if (!apiKey) {
    throw new Error('请先在设置中配置 API Key');
  }

  // Claude 使用不同的API格式
  if (type === 'claude') {
    return callClaudeAPI(baseUrl, apiKey, model, messages, temperature, maxTokens);
  }

  // Gemini 使用不同的API格式
  if (type === 'gemini') {
    return callGeminiAPI(baseUrl, apiKey, model, messages, temperature, maxTokens);
  }

  // DeepSeek / OpenAI / 智谱 / custom 均兼容 OpenAI 格式
  return callOpenAICompatibleAPI(baseUrl, apiKey, model, messages, temperature, maxTokens);
}

/** OpenAI兼容格式（DeepSeek、智谱等） */
async function callOpenAICompatibleAPI(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: LLMMessage[],
  temperature: number,
  maxTokens: number
): Promise<LLMResponse> {
  const url = `${baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API请求失败 (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    content: data.choices[0]?.message?.content ?? '',
    usage: data.usage
      ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens }
      : undefined,
  };
}

/** Claude API格式 */
async function callClaudeAPI(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: LLMMessage[],
  temperature: number,
  maxTokens: number
): Promise<LLMResponse> {
  // Claude要求system消息单独传
  const systemMsg = messages.find((m) => m.role === 'system')?.content ?? '';
  const chatMessages = messages.filter((m) => m.role !== 'system');

  const url = `${baseUrl}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemMsg,
      messages: chatMessages,
      temperature,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API请求失败 (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    content: data.content?.[0]?.text ?? '',
    usage: data.usage
      ? { promptTokens: data.usage.input_tokens, completionTokens: data.usage.output_tokens }
      : undefined,
  };
}

/** Gemini API格式 */
async function callGeminiAPI(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: LLMMessage[],
  temperature: number,
  maxTokens: number
): Promise<LLMResponse> {
  // Gemini使用不同的消息格式
  const systemInstruction = messages.find((m) => m.role === 'system')?.content;
  const chatMessages = messages.filter((m) => m.role !== 'system');

  const contents = chatMessages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API请求失败 (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
  };
}
