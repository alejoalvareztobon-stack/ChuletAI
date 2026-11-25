// Captura de audio en dos canales separados:
//  - system: audio del sistema (el entrevistador) vía getDisplayMedia + loopback de Electron.
//  - mic: micrófono con cancelación de eco (para no transcribir dos veces lo que sale por los parlantes).
// Cada canal se graba en Opus (WebM) a 32 kbps con MediaRecorder y se manda al proceso main.
// Opus ocupa ~8 veces menos que PCM crudo: importante cuando la videollamada satura la subida.
// Un AudioWorklet aparte solo mide el nivel (indicador) y si el audio sigue llegando.

import { rmsLevel } from '../../shared/pcm'
import type { AudioChannel } from '../../shared/types'

export const OPUS_MIME = 'audio/webm;codecs=opus'
export const OPUS_BITRATE = 32_000
/** Cada cuánto MediaRecorder entrega un trozo (ms). */
export const TIMESLICE_MS = 250

/** Diagnóstico y autoprueba: bloques medidos, trozos enviados y pistas terminadas por canal. */
export const audioStats: Record<AudioChannel, { chunks: number; sentBytes: number; recorders: number; ended: number }> = {
  system: { chunks: 0, sentBytes: 0, recorders: 0, ended: 0 },
  mic: { chunks: 0, sentBytes: 0, recorders: 0, ended: 0 }
}

export type AudioProblem = (channel: AudioChannel, reason: string) => void
type ChunkSink = (channel: AudioChannel, data: ArrayBuffer) => void

class ChannelCapture {
  private recorder: MediaRecorder | null = null
  private sendQueue: Promise<void> = Promise.resolve()

  constructor(
    readonly channel: AudioChannel,
    private readonly stream: MediaStream,
    private readonly ctx: AudioContext,
    private readonly cleanup: () => void,
    private readonly sink: ChunkSink
  ) {}

  /**
   * (Re)inicia la grabación. Cada conexión nueva con Deepgram necesita empezar con la
   * cabecera WebM, así que se llama cada vez que el main avisa de una conexión abierta.
   */
  startRecorder(): void {
    this.stopRecorder()
    const recorder = new MediaRecorder(this.stream, { mimeType: OPUS_MIME, audioBitsPerSecond: OPUS_BITRATE })
    const ch = this.channel
    recorder.ondataavailable = (e: BlobEvent) => {
      if (!e.data.size || this.recorder !== recorder) return
      // Se encadenan las conversiones para mantener el orden de los trozos.
      this.sendQueue = this.sendQueue.then(async () => {
        const buf = await e.data.arrayBuffer()
        if (this.recorder !== recorder) return
        audioStats[ch].sentBytes += buf.byteLength
        this.sink(ch, buf)
      })
    }
    this.recorder = recorder
    audioStats[ch].recorders++
    recorder.start(TIMESLICE_MS)
  }

  stopRecorder(): void {
    const r = this.recorder
    this.recorder = null
    if (r && r.state !== 'inactive') r.stop()
  }

  stop(): void {
    this.stopRecorder()
    this.cleanup()
    this.stream.getTracks().forEach((t) => t.stop())
    void this.ctx.close()
  }
}

async function captureChannel(
  stream: MediaStream,
  channel: AudioChannel,
  sink: ChunkSink,
  onLevel: (channel: AudioChannel, level: number) => void,
  onProblem: AudioProblem
): Promise<ChannelCapture> {
  const ctx = new AudioContext({ sampleRate: 16000 })
  // Si Windows suspende el contexto (cambio de dispositivo, etc.), lo reanudamos.
  ctx.onstatechange = () => {
    if (ctx.state === 'suspended') {
      onProblem(channel, 'audio context suspended, resuming')
      void ctx.resume()
    }
  }
  for (const track of stream.getAudioTracks()) {
    track.addEventListener('ended', () => {
      audioStats[channel].ended++
      onProblem(channel, 'track ended')
    })
  }
  await ctx.audioWorklet.addModule(new URL('./pcm-worklet.js', window.location.href).toString())
  const source = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'pcm-capture')
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    audioStats[channel].chunks++
    onLevel(channel, rmsLevel(e.data))
  }
  source.connect(node)
  // No conectamos a ctx.destination: así no se reproduce el audio capturado.
  return new ChannelCapture(
    channel,
    stream,
    ctx,
    () => {
      node.port.onmessage = null
      source.disconnect()
      node.disconnect()
    },
    sink
  )
}

export interface AudioCapture {
  errors: Partial<Record<AudioChannel, string>>
  startRecorder(channel: AudioChannel): void
  stopRecorder(channel: AudioChannel): void
  stop(): void
}

export async function startAudioCapture(
  sink: ChunkSink,
  onLevel: (channel: AudioChannel, level: number) => void,
  onProblem: AudioProblem = () => {}
): Promise<AudioCapture> {
  const captures = new Map<AudioChannel, ChannelCapture>()
  const errors: Partial<Record<AudioChannel, string>> = {}

  if (!MediaRecorder.isTypeSupported(OPUS_MIME)) {
    errors.system = errors.mic = `${OPUS_MIME} not supported`
    return { errors, startRecorder() {}, stopRecorder() {}, stop() {} }
  }

  try {
    // El handler del main responde con la pantalla + audio 'loopback'. Solo usamos el audio.
    const display = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })
    display.getVideoTracks().forEach((t) => t.stop())
    if (display.getAudioTracks().length === 0) throw new Error('no loopback audio track')
    captures.set('system', await captureChannel(new MediaStream(display.getAudioTracks()), 'system', sink, onLevel, onProblem))
  } catch (err) {
    errors.system = err instanceof Error ? err.message : String(err)
  }

  try {
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      video: false
    })
    captures.set('mic', await captureChannel(mic, 'mic', sink, onLevel, onProblem))
  } catch (err) {
    errors.mic = err instanceof Error ? err.message : String(err)
  }

  return {
    errors,
    startRecorder: (channel) => captures.get(channel)?.startRecorder(),
    stopRecorder: (channel) => captures.get(channel)?.stopRecorder(),
    stop() {
      captures.forEach((c) => c.stop())
    }
  }
}

/** Solo para la autoprueba en vivo: reproduce un audio (en bucle) como si fuera el audio del sistema. */
export async function startFileCapture(
  sink: ChunkSink,
  onLevel: (channel: AudioChannel, level: number) => void,
  data: ArrayBuffer
): Promise<AudioCapture> {
  const ctx = new AudioContext()
  const buffer = await ctx.decodeAudioData(data)
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  const dest = ctx.createMediaStreamDestination()
  src.connect(dest)
  src.start()
  const cap = await captureChannel(dest.stream, 'system', sink, onLevel, () => {})
  return {
    errors: {},
    startRecorder: (c) => c === 'system' && cap.startRecorder(),
    stopRecorder: (c) => c === 'system' && cap.stopRecorder(),
    stop() {
      cap.stop()
      src.stop()
      void ctx.close()
    }
  }
}
