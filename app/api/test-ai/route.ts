import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createVertexClient, getVertexModel, isVertexConfigured } from '@/lib/ai/vertex'

export const dynamic = 'force-dynamic'

export async function GET() {
  const results: Record<string, unknown> = {}
  const provider = process.env.AI_PROVIDER?.trim()?.toLowerCase() || 'anthropic'
  
  results.configuredProvider = provider
  results.vertexConfigured = isVertexConfigured()
  results.anthropicConfigured = Boolean(process.env.ANTHROPIC_API_KEY)
  
  // Test Vertex AI if configured
  if (provider === 'vertex' && isVertexConfigured()) {
    try {
      const model = getVertexModel()
      results.vertexModel = model
      const client = createVertexClient()
      
      const response = await client.models.generateContent({
        model,
        contents: 'Say "Vertex AI is working!" and nothing else.',
      })
      
      results.vertexTest = {
        success: true,
        response: response.text?.trim(),
      }
    } catch (error) {
      results.vertexTest = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
  
  // Test Anthropic as fallback
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-3-5-sonnet-20241022'
      results.anthropicModel = model
      
      const { text } = await generateText({
        model: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(model),
        prompt: 'Say "Anthropic is working!" and nothing else.',
      })
      
      results.anthropicTest = {
        success: true,
        response: text,
      }
    } catch (error) {
      console.error('[test-ai] Anthropic test error:', error)
      results.anthropicTest = {
        success: false,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5).join('\n') : undefined,
        cause: error instanceof Error && error.cause ? String(error.cause) : undefined,
      }
    }
  }
  
  return Response.json(results, {
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
