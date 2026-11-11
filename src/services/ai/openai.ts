import OpenAI from 'openai'
import {
  AIAgentProvider,
  AIToolDefinition,
  AIMessage,
  AITurnResult,
  AIToolCall,
} from './types'

export class OpenAIProvider implements AIAgentProvider {
  readonly name = 'openai'
  private client: OpenAI
  private modelName: string

  constructor(apiKey?: string, modelName: string = 'gpt-4o') {
    const key = apiKey || process.env.OPENAI_API_KEY
    if (!key) {
      throw new Error(
        'OpenAI API key is not configured. Please set OPENAI_API_KEY in your environment.'
      )
    }
    this.client = new OpenAI({ apiKey: key.trim() })
    this.modelName = modelName
  }

  async generateTurn(
    messages: AIMessage[],
    tools: AIToolDefinition[],
    systemInstruction?: string
  ): Promise<AITurnResult> {
    const openaiTools: OpenAI.ChatCompletionTool[] = tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters.properties,
          required: tool.parameters.required,
        },
      },
    }))

    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = []

    if (systemInstruction) {
      openaiMessages.push({
        role: 'system',
        content: systemInstruction,
      })
    }

    for (const msg of messages) {
      if (msg.role === 'system') {
        openaiMessages.push({ role: 'system', content: msg.content || '' })
      } else if (msg.role === 'user') {
        openaiMessages.push({ role: 'user', content: msg.content || '' })
      } else if (msg.role === 'assistant') {
        openaiMessages.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls?.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args),
            },
          })),
        })
      } else if (msg.role === 'tool') {
        openaiMessages.push({
          role: 'tool',
          tool_call_id: msg.toolCallId || 'call_0',
          content: msg.content || '',
        })
      }
    }

    const completion = await this.client.chat.completions.create({
      model: this.modelName,
      messages: openaiMessages,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
    })

    const choice = completion.choices[0]
    const message = choice.message

    const toolCalls: AIToolCall[] = []
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        if ('function' in tc && tc.function) {
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(tc.function.arguments)
          } catch {
            args = {}
          }
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            args,
          })
        }
      }
    }

    return {
      text: message.content || undefined,
      toolCalls,
      finishReason: choice.finish_reason,
    }
  }
}

