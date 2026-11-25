// Proveedor Claude con @anthropic-ai/sdk, en streaming.
// Haiku 5.5: el pensamiento adaptativo viene activo por defecto; para bajar la latencia
// usamos output_config.effort (por defecto 'low'), que es la palanca recomendada.

import Anthropic from '@anthropic-ai/sdk'
import { AiRefusalError, type AiProvider, type AiStreamRequest } from './provider'

export class AnthropicProvider implements AiProvider {
  readonly id = 'anthropic' as const
  private readonly client: Anthropic

  constructor(
    apiKey: string,
    private readonly model: string
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 })
  }

  async stream(req: AiStreamRequest): Promise<void> {
    const content: Anthropic.ContentBlockParam[] = []
    if (req.image) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: req.image.mediaType, data: req.image.base64 }
      })
    }
    content.push({ type: 'text', text: req.user })

    const stream = this.client.messages.stream(
      {
        model: this.model,
        // El pensamiento cuenta contra max_tokens: dejamos margen aunque las respuestas sean cortas.
        max_tokens: 16000,
        // El prompt del sistema (reglas + CV + descripción del cargo) es estable: se cachea.
        system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
        output_config: { effort: req.effort },
        messages: [{ role: 'user', content }]
      },
      { signal: req.signal }
    )

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        req.onText(event.delta.text)
      }
    }

    const final = await stream.finalMessage()
    if (final.stop_reason === 'refusal') {
      throw new AiRefusalError('The model declined this request.')
    }
  }
}

/** Mensaje de error legible a partir de los errores tipados del SDK. */
export function describeAnthropicError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'Anthropic: invalid API key (401).'
  if (err instanceof Anthropic.PermissionDeniedError) return 'Anthropic: permission denied (403).'
  if (err instanceof Anthropic.NotFoundError) return 'Anthropic: model not found (404). Check the model name in Settings.'
  if (err instanceof Anthropic.RateLimitError) return 'Anthropic: rate limit reached (429). Try again in a moment.'
  if (err instanceof Anthropic.APIConnectionError) return 'Anthropic: no connection to the API.'
  if (err instanceof Anthropic.APIError) return `Anthropic: ${err.status ?? ''} ${err.message}`.trim()
  return err instanceof Error ? err.message : String(err)
}
