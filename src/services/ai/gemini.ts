import {
  GoogleGenerativeAI,
  FunctionDeclaration,
  Part,
  Content,
  FunctionDeclarationSchema,
  FunctionDeclarationSchemaProperty,
} from '@google/generative-ai'
import {
  AIAgentProvider,
  AIToolDefinition,
  AIMessage,
  AITurnResult,
  AIToolCall,
} from './types'

export class GeminiProvider implements AIAgentProvider {
  readonly name = 'gemini'
  private genAI: GoogleGenerativeAI
  private modelName: string

  constructor(apiKey?: string, modelName: string = 'gemini-flash-latest') {
    const key = apiKey || process.env.GEMINI_API_KEY
    if (!key) {
      throw new Error(
        'Gemini API key is not configured. Please set GEMINI_API_KEY in your environment.'
      )
    }
    this.genAI = new GoogleGenerativeAI(key.trim())
    this.modelName = modelName
  }

  async generateTurn(
    messages: AIMessage[],
    tools: AIToolDefinition[],
    systemInstruction?: string
  ): Promise<AITurnResult> {
    // Convert tool definitions to Gemini function declarations
    const functionDeclarations: FunctionDeclaration[] = tools.map((tool) => {
      const properties: Record<string, FunctionDeclarationSchemaProperty> = {}
      for (const [propName, propDef] of Object.entries(tool.parameters.properties)) {
        properties[propName] = {
          type: propDef.type.toUpperCase() as any,
          description: propDef.description,
          ...(propDef.enum ? { enum: propDef.enum } : {}),
          ...(propDef.items
            ? {
                items: {
                  type: propDef.items.type.toUpperCase() as any,
                  ...(propDef.items.properties
                    ? { properties: propDef.items.properties as any }
                    : {}),
                },
              }
            : {}),
        }
      }

      const schema: FunctionDeclarationSchema = {
        type: 'OBJECT' as any,
        properties: properties as any,
        required: tool.parameters.required || [],
      }

      return {
        name: tool.name,
        description: tool.description,
        parameters: schema,
      }
    })

    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      systemInstruction: systemInstruction || undefined,
      tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
    })

    // Convert AIMessage[] to Gemini Content[]
    const contents: Content[] = []

    for (const msg of messages) {
      if (msg.role === 'system') {
        // System instructions are passed above
        continue
      }

      if (msg.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content || '' }],
        })
      } else if (msg.role === 'assistant') {
        if (msg.rawParts && (msg.rawParts as Part[]).length > 0) {
          contents.push({ role: 'model', parts: msg.rawParts as Part[] })
        } else {
          const parts: Part[] = []
          if (msg.content) {
            parts.push({ text: msg.content })
          }
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            for (const tc of msg.toolCalls) {
              parts.push({
                functionCall: {
                  name: tc.name,
                  args: tc.args,
                },
              })
            }
          }
          if (parts.length > 0) {
            contents.push({ role: 'model', parts })
          }
        }
      } else if (msg.role === 'tool') {
        // Tool result message
        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: msg.name || 'tool',
                response: {
                  result: msg.content ? JSON.parse(msg.content) : {},
                },
              },
            },
          ],
        })
      }
    }

    const response = await model.generateContent({ contents })
    const candidate = response.response.candidates?.[0]

    let text: string | undefined
    try {
      text = response.response.text()
    } catch {
      text = undefined
    }

    const toolCalls: AIToolCall[] = []
    const funcCalls = response.response.functionCalls()

    if (funcCalls && funcCalls.length > 0) {
      for (let i = 0; i < funcCalls.length; i++) {
        const fc = funcCalls[i]
        toolCalls.push({
          id: `call_${Date.now()}_${i}`,
          name: fc.name,
          args: (fc.args as Record<string, unknown>) || {},
        })
      }
    }

    return {
      text: text || undefined,
      toolCalls,
      finishReason: candidate?.finishReason,
      rawParts: candidate?.content?.parts,
    }
  }
}

