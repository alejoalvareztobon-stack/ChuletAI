// AudioWorklet: junta muestras Float32 y las envía en bloques de ~100 ms.
// El AudioContext se crea a 16 kHz, así que el navegador ya hace el remuestreo.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.chunk = new Float32Array(1600)
    this.offset = 0
  }
  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0) return true
    // Mezcla a mono si hay varios canales.
    const frames = input[0].length
    for (let i = 0; i < frames; i++) {
      let sum = 0
      for (let c = 0; c < input.length; c++) sum += input[c][i]
      this.chunk[this.offset++] = sum / input.length
      if (this.offset === this.chunk.length) {
        this.port.postMessage(this.chunk.slice(0))
        this.offset = 0
      }
    }
    return true
  }
}
registerProcessor('pcm-capture', PcmCapture)
