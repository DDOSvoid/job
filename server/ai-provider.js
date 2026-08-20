// AI 回答生成接缝（OpenAI 兼容 chat/completions）。
//
// 配置（环境变量）：
//   AI_API_KEY  必填，未配置时生成接口返回「未接入」，UI 如实提示，不编造答案
//   AI_BASE_URL 默认 https://api.deepseek.com（DeepSeek 是 OpenAI 兼容协议）
//   AI_MODEL    默认 deepseek-chat
//
// 设计意图：先把接口契约定好（POST /api/questions/:id/ai-answer → 生成并保存），
// 生成实现留在这里。填上 AI_API_KEY 即生效，无需改路由。
const BASE_URL = process.env.AI_BASE_URL || 'https://api.deepseek.com'
const MODEL = process.env.AI_MODEL || 'deepseek-chat'
const API_KEY = process.env.AI_API_KEY || ''
const TIMEOUT_MS = 60_000

export function isAiConfigured() {
  return Boolean(API_KEY)
}

/**
 * 让 AI 作答一道量化面试题。返回统一结构：
 *   { ok: true, answer, model }                 —— 成功
 *   { ok: false, reason: 'not_configured' }     —— 未配 AI_API_KEY
 *   { ok: false, reason: 'provider_error', message } —— 调用失败/非 2xx
 */
export async function generateAnswer({ question, myAnswer }) {
  if (!isAiConfigured()) return { ok: false, reason: 'not_configured' }

  const user = [
    `面试题：${question}`,
    ...(myAnswer ? [`\n我的初步回答（供参考，可指出不足与改进）：\n${myAnswer}`] : []),
    '\n请给出高质量的中文作答：先给直接答案/思路，再分要点展开，最后给一个可以口头说出来的简洁总结。',
  ].join('\n')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content:
              '你是资深量化研究员面试官兼面试教练。你的作答应专业、结构清晰、口语化（像在面试里直接讲出来），不堆砌空话。',
          },
          { role: 'user', content: user },
        ],
        temperature: 0.6,
        max_tokens: 1500,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, reason: 'provider_error', message: `provider ${res.status}: ${text.slice(0, 200)}` }
    }
    const data = await res.json()
    const answer = data?.choices?.[0]?.message?.content?.trim()
    if (!answer) return { ok: false, reason: 'provider_error', message: 'provider 返回空内容' }
    return { ok: true, answer, model: MODEL }
  } catch (err) {
    const message = err?.name === 'AbortError' ? `provider 请求超时（>${TIMEOUT_MS / 1000}s）` : err.message
    return { ok: false, reason: 'provider_error', message }
  } finally {
    clearTimeout(timer)
  }
}
