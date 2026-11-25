// Lógica pura de la transcripción: fusiona eventos parciales/finales por canal,
// agrupa turnos y prepara el texto que va al prompt. Sin dependencias de Electron.

import { CHANNEL_SPEAKER, type Speaker, type SttEvent, type TranscriptSegment } from './types'

export interface TranscriptState {
  segments: TranscriptSegment[]
  /** Texto provisional (aún no final) por hablante. */
  interim: Partial<Record<Speaker, TranscriptSegment>>
  nextId: number
}

export interface TranscriptOptions {
  /** Si el mismo hablante vuelve a hablar antes de este margen, se une al segmento anterior. */
  mergeGapMs: number
  /** Máximo de segmentos guardados (los más viejos se descartan). */
  maxSegments: number
}

export const DEFAULT_TRANSCRIPT_OPTIONS: TranscriptOptions = {
  mergeGapMs: 2500,
  maxSegments: 400
}

export function createTranscript(): TranscriptState {
  return { segments: [], interim: {}, nextId: 1 }
}

function joinText(a: string, b: string): string {
  if (!a) return b
  if (!b) return a
  return `${a} ${b}`.replace(/\s+/g, ' ').trim()
}

export function applySttEvent(
  state: TranscriptState,
  event: SttEvent,
  options: TranscriptOptions = DEFAULT_TRANSCRIPT_OPTIONS
): TranscriptState {
  const speaker = CHANNEL_SPEAKER[event.channel]
  const text = event.text.replace(/\s+/g, ' ').trim()
  const interim = { ...state.interim }

  if (!event.isFinal) {
    if (!text) {
      delete interim[speaker]
      return { ...state, interim }
    }
    const previous = interim[speaker]
    interim[speaker] = {
      id: previous?.id ?? `i-${speaker}`,
      speaker,
      text,
      final: false,
      start: previous?.start ?? event.ts,
      end: event.ts
    }
    return { ...state, interim }
  }

  // Evento final: reemplaza el provisional de ese hablante.
  const pendingStart = interim[speaker]?.start
  delete interim[speaker]
  if (!text) return { ...state, interim }

  const segments = state.segments.slice()
  const last = segments[segments.length - 1]
  if (last && last.speaker === speaker && event.ts - last.end <= options.mergeGapMs) {
    segments[segments.length - 1] = { ...last, text: joinText(last.text, text), end: event.ts }
  } else {
    segments.push({
      id: `s${state.nextId}`,
      speaker,
      text,
      final: true,
      start: pendingStart ?? event.ts,
      end: event.ts
    })
  }
  const trimmed = segments.length > options.maxSegments ? segments.slice(-options.maxSegments) : segments
  return { segments: trimmed, interim, nextId: state.nextId + 1 }
}

/** Segmentos finales más los provisionales, en orden cronológico (para pintar el panel). */
export function visibleSegments(state: TranscriptState): TranscriptSegment[] {
  const pending = Object.values(state.interim).filter((s): s is TranscriptSegment => Boolean(s))
  return [...state.segments, ...pending.sort((a, b) => a.start - b.start)]
}

/**
 * Última intervención del entrevistador: el bloque final de segmentos suyos
 * (incluye lo que aún está diciendo). Si el candidato ya respondió, devuelve
 * el bloque anterior del entrevistador.
 */
export function lastInterviewerTurn(state: TranscriptState): string {
  const parts: string[] = []
  const segs = state.segments
  let i = segs.length - 1
  const interim = state.interim.interviewer?.text ?? ''

  // Si el entrevistador está hablando ahora mismo, ese bloque es el más reciente.
  if (interim) {
    while (i >= 0 && segs[i].speaker === 'interviewer') {
      parts.unshift(segs[i].text)
      i--
    }
    parts.push(interim)
    return parts.join(' ').trim()
  }

  while (i >= 0 && segs[i].speaker !== 'interviewer') i--
  while (i >= 0 && segs[i].speaker === 'interviewer') {
    parts.unshift(segs[i].text)
    i--
  }
  return parts.join(' ').trim()
}

export const PROMPT_SPEAKER_LABEL: Record<Speaker, string> = {
  interviewer: 'Interviewer',
  me: 'Me (candidate)'
}

/**
 * Formatea la transcripción para el prompt, desde lo más reciente hacia atrás,
 * hasta `maxChars`. Si se recorta, empieza con "[...]".
 */
export function formatTranscriptForPrompt(state: TranscriptState, maxChars = 6000): string {
  const lines = visibleSegments(state).map((s) => `${PROMPT_SPEAKER_LABEL[s.speaker]}: ${s.text}${s.final ? '' : ' …'}`)
  const out: string[] = []
  let total = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    const len = lines[i].length + 1
    if (total + len > maxChars) {
      if (out.length === 0) out.unshift(`[...] ${lines[i].slice(-(maxChars - 6))}`)
      else out.unshift('[...]')
      break
    }
    out.unshift(lines[i])
    total += len
  }
  return out.join('\n')
}

export function clearTranscript(state: TranscriptState): TranscriptState {
  return { segments: [], interim: {}, nextId: state.nextId }
}
