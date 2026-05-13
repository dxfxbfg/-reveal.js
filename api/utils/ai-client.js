// AI Client - 统一的 OpenRouter 调用封装
// 所有 Agent 共享使用，通过 OpenRouter 调用 MiniMax 模型
// 支持 OpenRouter + OpenAI 兼容 API

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'minimax/minimax-01-mini';  // MiniMax 模型（性价比最高）
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT = 300000; // 5分钟超时

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`请求超时（${timeoutMs}ms），请稍后重试`);
    }
    throw error;
  }
}

async function callAI(messages, model = DEFAULT_MODEL, maxTokens = 8000) {
  if (!OPENROUTER_API_KEY) throw new Error('未配置 OPENROUTER_API_KEY');
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://reveal-js-ha8o.vercel.app',
          'X-Title': '云心 - AI 幻灯片生成器',
        },
        body: JSON.stringify({
          model: model,
          messages,
          temperature: 0.6,
          max_tokens: maxTokens,
        }),
      }, REQUEST_TIMEOUT);

      const responseText = await response.text();

      if (!response.ok) {
        let errorDetail = responseText.slice(0, 300);
        try {
          const errorJson = JSON.parse(responseText);
          errorDetail = errorJson.error?.message || errorJson.message || errorDetail;
        } catch (_) { }
        throw new Error(`OpenRouter API 错误 (${response.status}): ${errorDetail}`);
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        console.error('OpenRouter API 返回非 JSON:', responseText.slice(0, 500));
        throw new Error('AI 服务返回了无效数据格式，请稍后重试');
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        console.error('AI 返回空内容:', JSON.stringify(data).slice(0, 500));
        throw new Error('AI 返回内容为空');
      }
      return content;
    } catch (error) {
      lastError = error;
      console.error(`AI 调用尝试 ${attempt + 1}/${MAX_RETRIES + 1} 失败:`, error.message);
      if (attempt === MAX_RETRIES) {
        throw new Error(`AI 调用失败: ${error.message}`);
      }
      const delay = 1500 * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// 向后兼容别名
const callZhipuAI = callAI;

module.exports = { callAI, callZhipuAI, DEFAULT_MODEL };
