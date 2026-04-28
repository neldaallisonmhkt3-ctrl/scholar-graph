/**
 * 实验数据处理 - 拍照识别服务
 * 调用 LLM 视觉能力识别实验数据照片，返回结构化变量+数据表
 */
import type { ModelProvider, LabVariable } from '@/types';
import { callLLM } from '@/services/llm';

/** 构建识别Prompt */
function buildOcrPrompt(): string {
  return `你是一个物理实验数据识别助手。用户会给你一张实验数据记录的照片，请识别其中的数据表格。

要求：
1. 识别出所有变量名（包含单位，如 D/mm、h/mm、U/V 等）
2. 识别出每个变量对应的所有测量值
3. 如果能识别出仪器误差限（如"Δ仪=0.02mm"），也要提取
4. 数值保留原始精度，不要四舍五入

请严格按以下JSON格式返回，不要添加任何其他文字：
{
  "variables": [
    {
      "name": "D/mm",
      "values": [12.34, 12.36, 12.35],
      "instrumentError": 0.02
    },
    {
      "name": "h/mm",
      "values": [5.67, 5.65, 5.66],
      "instrumentError": null
    }
  ]
}

如果某个变量的仪器误差限无法识别，instrumentError 设为 null。`;
}

/** 解析LLM返回的OCR结果 */
function parseOcrResult(text: string): LabVariable[] {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.variables)) {
        return parsed.variables
          .filter((v: Record<string, unknown>) => typeof v.name === 'string' && Array.isArray(v.values))
          .map((v: Record<string, unknown>) => ({
            name: String(v.name),
            values: (v.values as unknown[]).map(n => Number(n)).filter(n => !isNaN(n)),
            instrumentError: typeof v.instrumentError === 'number' ? v.instrumentError : undefined,
          }));
      }
    }
  } catch {
    // 解析失败
  }
  return [];
}

/**
 * 拍照识别实验数据
 * @param imageBase64 图片的Base64编码（不含data:前缀）
 * @param provider LLM提供者（需要支持视觉能力的模型）
 * @param mimeType 图片MIME类型
 */
export async function recognizeLabData(
  imageBase64: string,
  provider: ModelProvider,
  mimeType: string = 'image/jpeg'
): Promise<LabVariable[]> {
  const prompt = buildOcrPrompt();

  // 根据provider类型构建不同的消息格式
  if (provider.provider === 'gemini') {
    return recognizeWithGemini(imageBase64, provider, mimeType, prompt);
  } else if (provider.provider === 'claude') {
    return recognizeWithClaude(imageBase64, provider, mimeType, prompt);
  } else {
    // OpenAI兼容格式（DeepSeek、智谱等，需要模型支持视觉）
    return recognizeWithOpenAI(imageBase64, provider, mimeType, prompt);
  }
}

/** Gemini 视觉识别 */
async function recognizeWithGemini(
  imageBase64: string,
  provider: ModelProvider,
  mimeType: string,
  prompt: string
): Promise<LabVariable[]> {
  const url = `${provider.baseUrl}/models/${provider.defaultModel}:generateContent?key=${provider.apiKey}`;
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType,
            data: imageBase64,
          },
        },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
    },
  };

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
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return parseOcrResult(text);
}

/** Claude 视觉识别 */
async function recognizeWithClaude(
  imageBase64: string,
  provider: ModelProvider,
  mimeType: string,
  prompt: string
): Promise<LabVariable[]> {
  const url = `${provider.baseUrl}/messages`;
  const body = {
    model: provider.defaultModel,
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType,
            data: imageBase64,
          },
        },
      ],
    }],
    temperature: 0.1,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API请求失败 (${res.status}): ${err}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? '';
  return parseOcrResult(text);
}

/** OpenAI兼容格式视觉识别 */
async function recognizeWithOpenAI(
  imageBase64: string,
  provider: ModelProvider,
  mimeType: string,
  prompt: string
): Promise<LabVariable[]> {
  const url = `${provider.baseUrl}/chat/completions`;
  const body = {
    model: provider.defaultModel,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: {
            url: `data:${mimeType};base64,${imageBase64}`,
          },
        },
      ],
    }],
    temperature: 0.1,
    max_tokens: 4096,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API请求失败 (${res.status}): ${err}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  return parseOcrResult(text);
}

/**
 * 将图片文件转为Base64
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 去掉 data:image/xxx;base64, 前缀
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
