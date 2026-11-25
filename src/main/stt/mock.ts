// Transcripción simulada: reproduce una conversación de ejemplo con resultados
// parciales y finales, igual que Deepgram, sin red ni audio.

import type { AudioChannel, InterviewLanguage, SttEvent, SttStatus } from '../../shared/types'

type Line = { channel: AudioChannel; text: string }

const SCRIPT: Record<'en' | 'es' | 'auto', Line[]> = {
  en: [
    { channel: 'system', text: 'Hi, thanks for joining. Could you start by telling me a bit about yourself?' },
    { channel: 'mic', text: 'Sure, thanks for having me.' },
    { channel: 'system', text: 'Tell me about a time you had to deal with a difficult deadline.' },
    { channel: 'mic', text: 'Yes, that happened in my last project.' },
    { channel: 'system', text: 'Why do you want to work with us?' }
  ],
  es: [
    { channel: 'system', text: 'Hola, gracias por conectarte. ¿Puedes empezar contándome un poco sobre ti?' },
    { channel: 'mic', text: 'Claro, gracias por la invitación.' },
    { channel: 'system', text: 'Cuéntame de una vez que tuviste que cumplir un plazo muy difícil.' },
    { channel: 'mic', text: 'Sí, me pasó en mi último proyecto.' },
    { channel: 'system', text: '¿Por qué quieres trabajar con nosotros?' }
  ],
  auto: [
    { channel: 'system', text: 'Hola, bienvenido. Let us start in English if that is ok. Tell me about yourself.' },
    { channel: 'mic', text: 'Sure, no problem.' },
    { channel: 'system', text: '¿Y cuál dirías que es tu mayor fortaleza?' },
    { channel: 'mic', text: 'Buena pregunta, déjame pensar.' },
    { channel: 'system', text: 'What would you do in your first ninety days?' }
  ]
}

export class MockStt {
  private timers: NodeJS.Timeout[] = []
  private stopped = false

  constructor(
    language: InterviewLanguage,
    private readonly onEvent: (e: SttEvent) => void,
    onStatus: (s: SttStatus) => void,
    /** Milisegundos por palabra (más bajo = más rápido; las pruebas usan valores pequeños). */
    private readonly msPerWord = 180
  ) {
    onStatus({ channel: 'system', state: 'open' })
    onStatus({ channel: 'mic', state: 'open' })
    this.play(SCRIPT[language], 0)
  }

  private at(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(() => !this.stopped && fn(), ms))
  }

  private play(lines: Line[], startAt: number): void {
    let t = startAt + 600
    for (const line of lines) {
      const words = line.text.split(' ')
      for (let n = 1; n < words.length; n += 2) {
        const partial = words.slice(0, n).join(' ')
        this.at(t + n * this.msPerWord, () =>
          this.onEvent({ channel: line.channel, text: partial, isFinal: false, ts: Date.now() })
        )
      }
      t += words.length * this.msPerWord
      this.at(t, () => this.onEvent({ channel: line.channel, text: line.text, isFinal: true, ts: Date.now() }))
      t += 3200
    }
  }

  send(): void {
    // El modo simulado ignora el audio real.
  }

  stop(): void {
    this.stopped = true
    this.timers.forEach(clearTimeout)
    this.timers = []
  }
}
