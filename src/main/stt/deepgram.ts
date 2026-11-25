// Transcripción en tiempo real con Deepgram Nova-3 por WebSocket.
// Una conexión por canal (sistema = entrevistador, micrófono = yo). El WebSocket vive en
// el proceso main para que la clave nunca llegue al renderer.

import WebSocket from 'ws'
import type { AudioChannel, InterviewLanguage, SttEvent, SttStatus } from '../../shared/types'

export const SAMPLE_RATE = 16000

/** URL de conexión. 'multi' = inglés y español mezclados (code-switching) en Nova-3. */
export function deepgramUrl(language: InterviewLanguage): string {
  const params = new URLSearchParams({
    model: 'nova-3',
    language: language === 'auto' ? 'multi' : language,
    encoding: 'linear16',
    sample_rate: String(SAMPLE_RATE),
    channels: '1',
    punctuate: 'true',
    smart_format: 'true',
    interim_results: 'true',
    endpointing: '300',
    utterance_end_ms: '1000',
    vad_events: 'true'
  })
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`
}

interface DeepgramResults {
  type: 'Results'
  is_final?: boolean
  speech_final?: boolean
  channel?: { alternatives?: Array<{ transcript?: string }> }
}

/** Convierte un mensaje de Deepgram en un evento nuestro (o null si no aplica). */
export function parseDeepgramMessage(channel: AudioChannel, raw: string, now = Date.now()): SttEvent | null {
  let msg: DeepgramResults
  try {
    msg = JSON.parse(raw)
  } catch {
    return null
  }
  if (msg.type !== 'Results') return null
  const text = msg.channel?.alternatives?.[0]?.transcript ?? ''
  const isFinal = Boolean(msg.is_final)
  if (!text && !isFinal) return null
  return { channel, text, isFinal, ts: now }
}

export class DeepgramChannel {
  private ws: WebSocket | null = null
  private keepAlive: NodeJS.Timeout | null = null
  private stopped = false
  private retries = 0
  private queue: Buffer[] = []

  constructor(
    private readonly channel: AudioChannel,
    private readonly apiKey: string,
    private readonly language: InterviewLanguage,
    private readonly onEvent: (e: SttEvent) => void,
    private readonly onStatus: (s: SttStatus) => void
  ) {
    this.connect()
  }

  private connect(): void {
    this.onStatus({ channel: this.channel, state: 'connecting' })
    const ws = new WebSocket(deepgramUrl(this.language), {
      headers: { Authorization: `Token ${this.apiKey}` }
    })
    this.ws = ws

    ws.on('open', () => {
      this.retries = 0
      this.onStatus({ channel: this.channel, state: 'open' })
      for (const chunk of this.queue.splice(0)) ws.send(chunk)
      this.keepAlive = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'KeepAlive' }))
      }, 8000)
    })
    ws.on('message', (data) => {
      const event = parseDeepgramMessage(this.channel, data.toString())
      if (event) this.onEvent(event)
    })
    ws.on('unexpected-response', (_req, res) => {
      const message =
        res.statusCode === 401 ? 'Deepgram: invalid API key (401)' : `Deepgram: HTTP ${res.statusCode ?? '?'}`
      this.onStatus({ channel: this.channel, state: 'error', message })
      this.stopped = true
    })
    ws.on('error', (err) => {
      this.onStatus({ channel: this.channel, state: 'error', message: `Deepgram: ${err.message}` })
    })
    ws.on('close', () => {
      if (this.keepAlive) clearInterval(this.keepAlive)
      this.keepAlive = null
      if (this.stopped) {
        this.onStatus({ channel: this.channel, state: 'closed' })
        return
      }
      // Reconexión con espera creciente (máx. 10 s).
      const delay = Math.min(10_000, 500 * 2 ** this.retries++)
      setTimeout(() => !this.stopped && this.connect(), delay)
    })
  }

  send(pcm: Buffer): void {
    if (this.stopped) return
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(pcm)
    else if (this.queue.length < 50) this.queue.push(pcm)
  }

  stop(): void {
    this.stopped = true
    if (this.keepAlive) clearInterval(this.keepAlive)
    const ws = this.ws
    if (!ws) return
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'CloseStream' }))
      setTimeout(() => ws.close(), 500)
    } else {
      ws.terminate()
    }
  }
}
