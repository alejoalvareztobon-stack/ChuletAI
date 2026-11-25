// Conversión de audio, sin dependencias del navegador (se puede probar en Node).

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
