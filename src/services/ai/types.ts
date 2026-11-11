export interface AIToolParameterProperty {
  type: string
  description?: string
  enum?: string[]
  items?: {
    type: string
    properties?: Record<string, unknown>
  }
}

export interface AIToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, AIToolParameterProperty>
    required?: string[]
  }
}

export interface AIToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string
  toolCalls?: AIToolCall[]
  toolCallId?: string
  name?: string
  rawParts?: unknown[]
}

export interface AITurnResult {
  text?: string
  toolCalls: AIToolCall[]
  finishReason?: string
  rawParts?: unknown[]
}

export interface AIAgentProvider {
  readonly name: string
  generateTurn(
    messages: AIMessage[],
    tools: AIToolDefinition[],
    systemInstruction?: string
  ): Promise<AITurnResult>
}

