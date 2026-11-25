// Proveedor alternativo: Gemini Flash con @google/genai, en streaming.
// No se ha probado con una clave real (ver DECISIONS.md).

import { GoogleGenAI } from '@google/genai'
import type { AiProvider, AiStreamRequest } from './provider'

export class GeminiProvider implements AiProvider {
  readonly id = 'gemini' as const
  private readonly ai: GoogleGenAI

  constructor(
    apiKey: string,
    private readonly model: string
  ) {
    this.ai = new GoogleGenAI({ apiKey })
  }

  async stream(req: AiStreamRequest): Promise<void> {
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = []
    if (req.image) parts.push({ inlineData: { mimeType: req.image.mediaType, data: req.image.base64 } })
    parts.push({ text: req.user })

    const config: Record<string, unknown> = {
      systemInstruction: req.system,
      abortSignal: req.signal,
      maxOutputTokens: 4096
    }
    // En la familia 2.5 Flash el pensamiento se apaga con thinkingBudget 0 (menos latencia).
    if (/2\.5-flash/.test(this.model) && req.effort === 'low') config.thinkingConfig = { thinkingBudget: 0 }

    const response = await this.ai.models.generateContentStream({
      model: this.model,
      contents: [{ role: 'user', parts }],
      config
    })
    for await (const chunk of response) {
      if (req.signal.aborted) break
      const text = chunk.text
      if (text) req.onText(text)
    }
  }
}
