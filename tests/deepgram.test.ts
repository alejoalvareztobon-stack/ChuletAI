import { describe, expect, it } from 'vitest'
import { deepgramUrl, parseDeepgramMessage } from '../src/main/stt/deepgram'
import { floatToPcm16 } from '../src/shared/pcm'

describe('deepgramUrl', () => {
  it('uses Nova-3 with multilingual code-switching in auto mode', () => {
    const url = new URL(deepgramUrl('auto'))
    expect(url.host).toBe('api.deepgram.com')
    expect(url.searchParams.get('model')).toBe('nova-3')
    expect(url.searchParams.get('language')).toBe('multi')
    // WebM/Opus: Deepgram detecta el contenedor, así que no se fija encoding ni sample_rate.
    expect(url.searchParams.has('encoding')).toBe(false)
    expect(url.searchParams.has('sample_rate')).toBe(false)
    expect(url.searchParams.get('interim_results')).toBe('true')
  })

  it('uses a fixed language when the interview language is set', () => {
    expect(new URL(deepgramUrl('es')).searchParams.get('language')).toBe('es')
    expect(new URL(deepgramUrl('en')).searchParams.get('language')).toBe('en')
  })
})

describe('parseDeepgramMessage', () => {
  const results = (transcript: string, isFinal: boolean): string =>
    JSON.stringify({ type: 'Results', is_final: isFinal, channel: { alternatives: [{ transcript }] } })

  it('turns Results into events for the right channel', () => {
    expect(parseDeepgramMessage('system', results('hello', false), 42)).toEqual({
      channel: 'system',
      text: 'hello',
      isFinal: false,
      ts: 42
    })
    expect(parseDeepgramMessage('mic', results('hola', true), 1)?.isFinal).toBe(true)
  })

  it('ignores metadata, empty partials and invalid JSON', () => {
    expect(parseDeepgramMessage('mic', JSON.stringify({ type: 'Metadata' }))).toBeNull()
    expect(parseDeepgramMessage('mic', results('', false))).toBeNull()
    expect(parseDeepgramMessage('mic', 'not json')).toBeNull()
    // Un final vacío sí pasa: sirve para cerrar el texto provisional.
    expect(parseDeepgramMessage('mic', results('', true))?.isFinal).toBe(true)
  })
})

describe('floatToPcm16', () => {
  it('converts and clamps samples', () => {
    const out = new Int16Array(floatToPcm16(new Float32Array([0, 1, -1, 2, -2, 0.5])))
    expect(Array.from(out)).toEqual([0, 32767, -32768, 32767, -32768, 16383])
  })
})
