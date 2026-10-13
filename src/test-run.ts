import { apply } from './index.js'

// 模拟 DSH 宿主的上下文与 web 门面服务
class MockWebContext {
  public provider: any = null

  public web = {
    registerSearchProvider: (provider: any) => {
      console.log(`[Mock DSH] 成功注册搜索驱动: "${provider.id}"`)
      this.provider = provider
    },
  }

  // 模拟凭据服务（如果需要）
  public get(service: string) {
    if (service === 'credentials') {
      return {
        resolve: async (key: string) => {
          // 这里可以读取配置或返回指定 key
          return { value: process.env[key] }
        },
      }
    }
    return undefined
  }
}

async function run() {
  console.log('--- 开始测试 dsh-toolkit (Tavily Search) ---')

  const mockCtx = new MockWebContext()

  // 1. 初始化并加载你的插件（支持直接传入自定义配置）
  apply(mockCtx as any, {
    tavily: {
      apiKeyEnv: 'TAVILY_API_KEY',
      // 如果不想配置环境变量，也可以直接在这里显式传入：
      // apiKey: 'tvly-your-key-here',
    },
  })

  if (!mockCtx.provider) {
    throw new Error('插件未能成功注册搜索驱动！')
  }

  // 2. 检查可用性
  const isAvailable = mockCtx.provider.available()
  console.log(`[Mock DSH] Provider 可用状态: ${isAvailable}`)

  if (!isAvailable) {
    console.warn('⚠️ Provider 显示不可用，请确保已设置环境变量 TAVILY_API_KEY 或在配置中传入了 apiKey。')
  }

  // 3. 模拟触发真实搜索
  const testQuery = 'DeepSeek latest news'
  console.log(`[Mock DSH] 正在发起真实搜索，关键词: "${testQuery}" ...`)

  try {
    const result = await mockCtx.provider.search({
      query: testQuery,
      maxResults: 3,
    })

    console.log('\n====== 搜索结果调用成功 ======')
    if (result.content) {
      console.log(`\n【AI 总结摘要】:\n${result.content}\n`)
    }
    console.log(`【检索到条目数】: ${result.sources.length}`)
    result.sources.forEach((item: any, idx: number) => {
      console.log(`\n[${idx + 1}] ${item.title ?? '无标题'}`)
      console.log(`    链接: ${item.url}`)
      console.log(`    摘要: ${item.snippet?.slice(0, 80)}...`)
    })
    console.log('\n==============================')
  } catch (err: any) {
    console.error('\n❌ 搜索执行出错:', err.message)
  }
}

run()