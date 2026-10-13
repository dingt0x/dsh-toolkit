import type { Context } from '@deepseek-ai/cordis'

const PROVIDER_ID = 'tavily'
const ENDPOINT = 'https://api.tavily.com/search'
const TIMEOUT_MS = 30000

// 允许用户自定义的插件配置项
export interface TavilyConfig {
  apiKey?: string
  apiKeyEnv?: string
}

export interface DshSearchRequest {
  query: string
  maxResults?: number
}

export interface DshSearchSource {
  url: string
  title?: string
  snippet?: string
  publishedAt?: string
}

export interface DshSearchResult {
  sources: DshSearchSource[]
  content?: string
  truncated: boolean
}

interface TavilyApiResponse {
  answer?: string
  results?: Array<{
    title?: string
    url?: string
    content?: string
    published_date?: string
  }>
}

export function registerTavilySearch(ctx: Context, config: TavilyConfig = {}) {
  const depth = process.env.TAVILY_SEARCH_DEPTH === 'advanced' ? 'advanced' : 'basic'
  const defaultMaxResults = Math.min(Math.max(Number(process.env.TAVILY_MAX_RESULTS) || 8, 1), 20)
  const topic = process.env.TAVILY_TOPIC === 'news' ? 'news' : 'general'
  const timeRange = ['day', 'week', 'month', 'year'].includes(process.env.TAVILY_TIME_RANGE ?? '')
    ? process.env.TAVILY_TIME_RANGE
    : undefined

  // 用户指定的环境变量名，没填就兜底使用默认的 TAVILY_API_KEY
  const envKeyName = config.apiKeyEnv || 'TAVILY_API_KEY'

  async function resolveApiKey(): Promise<string | undefined> {
    // 1. 最高优先级：用户在配置里直接填了 apiKey
    if (config.apiKey && config.apiKey.length > 0) {
      return config.apiKey
    }

    // 2. 第二优先级：从 DSH 的 credentials 凭据管理服务里拿
    const credentials = (ctx as any).get?.('credentials')
    if (credentials !== undefined) {
      const resolved = await credentials.resolve(envKeyName)
      if (resolved?.value && resolved.value.length > 0) {
        return resolved.value
      }
    }

    // 3. 第三优先级：从系统环境变量中读（读取用户自定义的名字）
    const envKey = process.env[envKeyName]
    return envKey && envKey.length > 0 ? envKey : undefined
  }

  ;(ctx as any).web?.registerSearchProvider({
    id: PROVIDER_ID,

    available(): boolean {
      const envVal = process.env[envKeyName]
      return (
        Boolean(config.apiKey) ||
        (ctx as any).get?.('credentials') !== undefined ||
        (envVal !== undefined && envVal.length > 0)
      )
    },

    async search(request: DshSearchRequest, signal?: AbortSignal): Promise<DshSearchResult> {
      const apiKey = await resolveApiKey()
      if (!apiKey) {
        throw new Error(
          `[search-tavily] 缺少 API Key：未找到环境变量 ${envKeyName}，请在 ~/.dsh/.credentials.yaml 写入或在插件配置中填写。`,
        )
      }

      const maxResults =
        Number.isInteger(request.maxResults) && (request.maxResults ?? 0) > 0
          ? Math.min(request.maxResults!, 20)
          : defaultMaxResults

      let response: Response
      try {
        const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS)
        const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal

        response = await fetch(ENDPOINT, {
          method: 'POST',
          redirect: 'error',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({
            query: request.query,
            search_depth: depth,
            max_results: maxResults,
            topic,
            include_answer: true,
            include_raw_content: false,
            ...(timeRange ? { time_range: timeRange } : {}),
          }),
          signal: combinedSignal,
        })
      } catch (error) {
        if (signal?.aborted) throw error
        throw new Error(`[search-tavily] 网络请求失败：${String(error)}`)
      }

      if (!response.ok) {
        let detail = ''
        try {
          const parsed = await response.json()
          detail = parsed?.detail?.error ?? parsed?.detail ?? parsed?.error ?? parsed?.message ?? ''
          if (typeof detail !== 'string') detail = JSON.stringify(detail)
        } catch {
          // 忽略非 JSON 错误体解析异常
        }
        throw new Error(`[search-tavily] Tavily API 错误（HTTP ${response.status}）${detail ? `：${detail}` : ''}`)
      }

      const data = (await response.json()) as TavilyApiResponse
      const sources: DshSearchSource[] = []

      for (const item of data.results ?? []) {
        if (!item?.url) continue
        const source: DshSearchSource = { url: item.url }
        if (item.title) source.title = item.title
        if (item.content) source.snippet = item.content
        if (item.published_date) source.publishedAt = item.published_date
        sources.push(source)
      }

      const result: DshSearchResult = { sources, truncated: false }
      if (data.answer) {
        result.content = data.answer
      }

      return result
    },
  })
}