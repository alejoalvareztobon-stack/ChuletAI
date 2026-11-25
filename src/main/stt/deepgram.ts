// Transcripción en tiempo real con Deepgram Nova-3 por WebSocket.
// Una conexión por canal (sistema = entrevistador, micrófono = yo). El WebSocket vive en
// el proceso main para que la clave nunca llegue al renderer.

import WebSocket from 'ws'
import type { AudioChannel, InterviewLanguage, SttEvent, SttStatus } from '../../shared/types'
import { log } from '../log'
import { RobustResolver } from '../net'

/**
 * URL de conexión. 'multi' = inglés y español mezclados (code-switching) en Nova-3.
 * El audio llega en WebM/Opus: Deepgram detecta el contenedor, así que no se indica encoding.
 */
export function deepgramUrl(language: InterviewLanguage): string {
  const params = new URLSearchParams({
    model: 'nova-3',
    language: language === 'auto' ? 'multi' : language,
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

/** ~32 kbps de Opus. */
const OPUS_BYTES_PER_SEC = 4000

/** Códigos HTTP del handshake que no se arreglan reintentando (clave inválida, sin saldo, sin permiso). */
export function isFatalHandshake(status: number | undefined): boolean {
  return status === 401 || status === 402 || status === 403
}

export function handshakeMessage(status: number | undefined): string {
  switch (status) {
    case 401:
      return 'Deepgram: invalid API key (401)'
    case 402:
      return 'Deepgram: no credit left on the account (402)'
    case 403:
      return 'Deepgram: this key has no permission for streaming (403)'
    case 429:
      return 'Deepgram: too many connections (429), retrying'
    default:
      return `Deepgram: HTTP ${status ?? '?'}, retrying`
  }
}

/** Espera antes del reintento n (0, 1, 2…): 0,5 s, 1 s, 2 s… hasta 8 s. Nunca se rinde. */
export function retryDelay(attempt: number): number {
  return Math.min(8000, 500 * 2 ** attempt)
}

const resolver = new RobustResolver(undefined, undefined, (host, how, err) =>
  log('dns', `${host}: system DNS failed (${(err as NodeJS.ErrnoException)?.code ?? err}), used ${how}`)
)

export class DeepgramChannel {
  private ws: WebSocket | null = null
  private keepAlive: NodeJS.Timeout | null = null
  private stats: NodeJS.Timeout | null = null
  private stopped = false
  private retries = 0
  private session = 0
  private lagWarned = false
  private bytesSinceStats = 0
  private lastError = ''
  private silent = false

  constructor(
    private readonly channel: AudioChannel,
    private readonly apiKey: string,
    private readonly language: InterviewLanguage,
    private readonly onEvent: (e: SttEvent) => void,
    private readonly onStatus: (s: SttStatus) => void
  ) {
    log('stt', `${channel}: start (language=${language})`)
    // Cada 15 s: registra cuánto audio llegó, para detectar capturas que se quedaron mudas.
    this.stats = setInterval(() => {
      const kb = Math.round(this.bytesSinceStats / 1024)
      this.bytesSinceStats = 0
      const backlog = this.ws?.bufferedAmount ?? 0
      log('stt', `${channel}: ${kb} KB of audio in 15 s, backlog=${Math.round(backlog / 1024)} KB, socket=${this.ws?.readyState ?? 'none'}`)
      if (this.stopped) return
      if (kb === 0) {
        this.silent = true
        this.onStatus({ channel, state: 'error', message: 'No audio is arriving from this source' })
      } else if (this.silent && this.ws?.readyState === WebSocket.OPEN) {
        this.silent = false
        this.onStatus({ channel, state: 'open', session: this.session })
      }
    }, 15_000)
    this.connect()
  }

  private connect(): void {
    this.onStatus({
      channel: this.channel,
      state: 'connecting',
      message: this.retries > 0 ? `Reconnecting (attempt ${this.retries})… ${this.lastError}`.trim() : undefined
    })
    const ws = new WebSocket(deepgramUrl(this.language), {
      headers: { Authorization: `Token ${this.apiKey}` },
      lookup: resolver.lookup(),
      // En redes cargadas (videollamada en curso) el handshake puede tardar >10 s.
      handshakeTimeout: 20_000
    })
    this.ws = ws

    ws.on('open', () => {
      log('stt', `${this.channel}: open${this.retries ? ` after ${this.retries} retries` : ''}`)
      this.retries = 0
      this.lastError = ''
      this.session++
      this.onStatus({ channel: this.channel, state: 'open', session: this.session })
      this.keepAlive = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'KeepAlive' }))
      }, 8000)
    })
    ws.on('message', (data) => {
      const raw = data.toString()
      const event = parseDeepgramMessage(this.channel, raw)
      if (event) this.onEvent(event)
      else if (raw.includes('"Error"') || raw.includes('"error"')) log('stt', `${this.channel}: server message ${raw.slice(0, 300)}`)
    })
    ws.on('unexpected-response', (_req, res) => {
      const status = res.statusCode
      const message = handshakeMessage(status)
      log('stt', `${this.channel}: handshake HTTP ${status} dg-error=${res.headers['dg-error'] ?? ''}`)
      this.lastError = message
      this.onStatus({ channel: this.channel, state: 'error', message })
      if (isFatalHandshake(status)) {
        this.stopped = true
        return
      }
      ws.terminate()
      this.scheduleReconnect()
    })
    ws.on('error', (err) => {
      log('stt', `${this.channel}: error ${(err as NodeJS.ErrnoException).code ?? ''} ${err.message}`)
      this.lastError = `(${(err as NodeJS.ErrnoException).code ?? err.message})`
      this.onStatus({ channel: this.channel, state: 'error', message: `Deepgram: ${err.message}` })
    })
    ws.on('close', (code, reason) => {
      log('stt', `${this.channel}: close code=${code} reason=${reason.toString().slice(0, 200)}`)
      if (this.keepAlive) clearInterval(this.keepAlive)
      this.keepAlive = null
      if (this.stopped) {
        this.onStatus({ channel: this.channel, state: 'closed' })
        return
      }
      if (this.ws === ws) this.scheduleReconnect()
    })
  }

  private reconnectTimer: NodeJS.Timeout | null = null

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return
    const delay = retryDelay(this.retries++)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.stopped) this.connect()
    }, delay)
  }

  /** Trozo WebM/Opus. Solo se envía con la conexión abierta: tras reconectar, el renderer reinicia la grabación. */
  send(chunk: Buffer): void {
    if (this.stopped) return
    this.bytesSinceStats += chunk.length
    const ws = this.ws
    if (ws?.readyState !== WebSocket.OPEN) return
    ws.send(chunk)
    // Más de ~10 s de audio sin salir = la subida de internet no da abasto.
    const lagging = ws.bufferedAmount > (OPUS_BYTES_PER_SEC * 10)
    if (lagging !== this.lagWarned) {
      this.lagWarned = lagging
      log('stt', `${this.channel}: network ${lagging ? 'LAGGING' : 'recovered'} (backlog ${Math.round(ws.bufferedAmount / 1024)} KB)`)
      this.onStatus({
        channel: this.channel,
        state: 'open',
        session: this.session,
        message: lagging ? 'Slow upload: the transcript is running late' : undefined
      })
    }
  }

  stop(): void {
    log('stt', `${this.channel}: stop`)
    this.stopped = true
    if (this.keepAlive) clearInterval(this.keepAlive)
    if (this.stats) clearInterval(this.stats)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
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
