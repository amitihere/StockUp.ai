import { AIAgentProvider } from './types'
import { GeminiProvider, DEFAULT_GEMINI_MODEL } from './gemini'
import { OpenAIProvider } from './openai'

let hasLoggedStartup = false

export function getAIProvider(): AIAgentProvider {
  const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase().trim()

  if (provider === 'openai') {
    const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o'
    if (!hasLoggedStartup) {
      console.log(`[AI Startup] Active AI Provider: openai | Model: ${model}`)
      hasLoggedStartup = true
    }
    return new OpenAIProvider(undefined, model)
  }

  // Default to Gemini
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
  if (!hasLoggedStartup) {
    console.log(`[AI Startup] Active AI Provider: gemini | Model: ${model}`)
    hasLoggedStartup = true
  }
  return new GeminiProvider(undefined, model)
}

