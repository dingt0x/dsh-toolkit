import type { Context } from '@deepseek-ai/cordis'
import { registerTavilySearch, type TavilyConfig } from './tools/search-tavily.js'

export interface Config {
  tavily?: TavilyConfig | boolean
}
// 1. 声明插件在 DSH 容器中的唯一名称
export const name = 'dsh-toolkit'

// 2. 声明强依赖 DSH 官方的 web 基础服务
export const inject = ['web']

const toolList: string[] = []




// 3. 插件激活时的生命周期入口
export function apply(ctx: Context, config: Config={}) {
  // 挂载 Tavily 搜索能力
  if (config.tavily !== false) {
     const tavilyOptions = typeof config.tavily === 'object' ? config.tavily : {}
     registerTavilySearch(ctx, tavilyOptions)
     toolList.push("tavily")
   }
  console.log(`[dsh-toolkit] 插件加载成功，${JSON.stringify(toolList)}。`)
}