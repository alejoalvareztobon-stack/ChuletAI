// Captura de audio en dos canales separados:
//  - system: audio del sistema (el entrevistador) vía getDisplayMedia + loopback de Electron.
//  - mic: micrófono con cancelación de eco (para no transcribir dos veces lo que sale por los parlantes).
// Cada canal se convierte a PCM 16 bits / 16 kHz mono y se manda al proceso main.

import type { AudioChannel } from '../../shared/types'

export const SAMPLE_RATE = 16000

/** Float32 [-1, 1] -> Int16 little-endian. */
export function floatToPcm16(input: Float32Array): ArrayBuffer {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out.buffer
}

/** Nivel RMS aproximado (0..1) para el indicador de actividad. */
export function rmsLevel(input: Float32Array): number {
  let sum = 0
  for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
  return Math.min(1, Math.sqrt(sum / Math.max(1, input.length)) * 4)
}

interface ChannelCapture {
  stop(): void
}

async function pipeStream(
  stream: MediaStream,
  channel: AudioChannel,
  onChunk: (channel: AudioChannel, pcm: ArrayBuffer) => void,
  onLevel: (channel: AudioChannel, level: number) => void
): Promise<ChannelCapture> {
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
  await ctx.audioWorklet.addModule(new URL('./pcm-worklet.js', window.location.href).toString())
  const source = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'pcm-capture')
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    onChunk(channel, floatToPcm16(e.data))
    onLevel(channel, rmsLevel(e.data))
  }
  source.connect(node)
  // No conectamos a ctx.destination: así no se reproduce el audio capturado.
  return {
    stop() {
      node.port.onmessage = null
      source.disconnect()
      node.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close()
    }
  }
}

export interface AudioCapture {
  stop(): void
  errors: Partial<Record<AudioChannel, string>>
}

export async function startAudioCapture(
  onChunk: (channel: AudioChannel, pcm: ArrayBuffer) => void,
  onLevel: (channel: AudioChannel, level: number) => void
): Promise<AudioCapture> {
  const captures: ChannelCapture[] = []
  const errors: Partial<Record<AudioChannel, string>> = {}

  try {
    // El handler del main responde con la pantalla + audio 'loopback'. Solo usamos el audio.
    const display = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })
    display.getVideoTracks().forEach((t) => t.stop())
    if (display.getAudioTracks().length === 0) throw new Error('no loopback audio track')
    captures.push(await pipeStream(new MediaStream(display.getAudioTracks()), 'system', onChunk, onLevel))
  } catch (err) {
    errors.system = err instanceof Error ? err.message : String(err)
  }

  try {
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      video: false
    })
    captures.push(await pipeStream(mic, 'mic', onChunk, onLevel))
  } catch (err) {
    errors.mic = err instanceof Error ? err.message : String(err)
  }

  return {
    errors,
    stop() {
      captures.forEach((c) => c.stop())
    }
  }
}
