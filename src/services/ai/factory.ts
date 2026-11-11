import { AIAgentProvider } from './types'
import { GeminiProvider } from './gemini'
import { OpenAIProvider } from './openai'

export function getAIProvider(): AIAgentProvider {
  const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase().trim()

  if (provider === 'openai') {
    return new OpenAIProvider()
  }

  // Default to Gemini
  return new GeminiProvider()
}

