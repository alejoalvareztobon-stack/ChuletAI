// Interfaz pequeña para cambiar de proveedor de IA (Claude, Gemini o simulado).

import type { Effort } from '../../shared/types'

export interface AiImage {
  /** JPEG en base64, sin el prefijo data:. */
  base64: string
  mediaType: 'image/jpeg' | 'image/png'
}

export interface AiStreamRequest {
  system: string
  user: string
  image?: AiImage
  effort: Effort
  /** Idioma esperado de la respuesta (solo lo usa el proveedor simulado). */
  language: 'en' | 'es'
  signal: AbortSignal
  onText: (delta: string) => void
}

export interface AiProvider {
  readonly id: 'anthropic' | 'gemini' | 'mock'
  /** Resuelve cuando termina el stream. Lanza error si falla o si el modelo se niega. */
  stream(req: AiStreamRequest): Promise<void>
}

export class AiRefusalError extends Error {}
