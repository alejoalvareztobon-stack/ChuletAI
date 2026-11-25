import { describe, expect, it } from 'vitest'
import {
  applySttEvent,
  clearTranscript,
  createTranscript,
  formatTranscriptForPrompt,
  lastInterviewerTurn,
  visibleSegments,
  type TranscriptState
} from '../src/shared/transcript'
import type { SttEvent } from '../src/shared/types'

const ev = (channel: SttEvent['channel'], text: string, isFinal: boolean, ts: number): SttEvent => ({
  channel,
  text,
  isFinal,
  ts
})

function feed(events: SttEvent[], state: TranscriptState = createTranscript()): TranscriptState {
  return events.reduce((s, e) => applySttEvent(s, e), state)
}

describe('applySttEvent', () => {
  it('maps channels to speakers (system = interviewer, mic = me)', () => {
    const s = feed([ev('system', 'Hello there', true, 1000), ev('mic', 'Hi', true, 5000)])
    expect(s.segments.map((x) => x.speaker)).toEqual(['interviewer', 'me'])
  })

  it('keeps interim text separate and replaces it with the final', () => {
    let s = feed([ev('system', 'Tell me', false, 1000), ev('system', 'Tell me about', false, 1200)])
    expect(s.segments).toHaveLength(0)
    expect(s.interim.interviewer?.text).toBe('Tell me about')
    expect(visibleSegments(s)).toHaveLength(1)
    s = applySttEvent(s, ev('system', 'Tell me about yourself.', true, 1500))
    expect(s.interim.interviewer).toBeUndefined()
    expect(s.segments).toHaveLength(1)
    expect(s.segments[0].text).toBe('Tell me about yourself.')
    // El segmento final empieza cuando empezó el texto provisional.
    expect(s.segments[0].start).toBe(1000)
  })

  it('merges consecutive finals from the same speaker within the gap', () => {
    const s = feed([ev('system', 'First part.', true, 1000), ev('system', 'Second part.', true, 2000)])
    expect(s.segments).toHaveLength(1)
    expect(s.segments[0].text).toBe('First part. Second part.')
  })

  it('starts a new segment after a long pause or a speaker change', () => {
    const s = feed([
      ev('system', 'One.', true, 1000),
      ev('system', 'Two.', true, 10_000),
      ev('mic', 'Three.', true, 10_500),
      ev('system', 'Four.', true, 11_000)
    ])
    expect(s.segments.map((x) => x.text)).toEqual(['One.', 'Two.', 'Three.', 'Four.'])
  })

  it('ignores empty finals and clears interim on empty partials', () => {
    let s = feed([ev('mic', 'uh', false, 1000)])
    s = applySttEvent(s, ev('mic', '', true, 1100))
    expect(s.segments).toHaveLength(0)
    expect(s.interim.me).toBeUndefined()
    s = feed([ev('mic', 'hm', false, 1000), ev('mic', '   ', false, 1100)])
    expect(s.interim.me).toBeUndefined()
  })

  it('normalizes whitespace', () => {
    const s = feed([ev('system', '  Hola,   ¿cómo   estás? ', true, 1)])
    expect(s.segments[0].text).toBe('Hola, ¿cómo estás?')
  })

  it('caps the number of stored segments', () => {
    let s = createTranscript()
    for (let i = 0; i < 20; i++) {
      s = applySttEvent(s, ev(i % 2 ? 'mic' : 'system', `line ${i}`, true, i * 10_000), {
        mergeGapMs: 100,
        maxSegments: 5
      })
    }
    expect(s.segments).toHaveLength(5)
    expect(s.segments[4].text).toBe('line 19')
  })
})

describe('lastInterviewerTurn', () => {
  it('returns empty when the interviewer has not spoken', () => {
    expect(lastInterviewerTurn(feed([ev('mic', 'Hi', true, 1)]))).toBe('')
  })

  it('returns the latest block of interviewer segments', () => {
    const s = feed([
      ev('system', 'Old question?', true, 1000),
      ev('mic', 'Old answer.', true, 5000),
      ev('system', 'Thanks.', true, 9000),
      ev('system', 'What is your biggest weakness?', true, 20_000)
    ])
    expect(lastInterviewerTurn(s)).toBe('Thanks. What is your biggest weakness?')
  })

  it('still finds the question after I started answering', () => {
    const s = feed([ev('system', '¿Por qué este cargo?', true, 1000), ev('mic', 'Bueno, porque', true, 3000)])
    expect(lastInterviewerTurn(s)).toBe('¿Por qué este cargo?')
  })

  it('includes what the interviewer is saying right now', () => {
    const s = feed([ev('system', 'So,', true, 1000), ev('system', 'tell me about a conflict', false, 1500)])
    expect(lastInterviewerTurn(s)).toBe('So, tell me about a conflict')
  })
})

describe('formatTranscriptForPrompt', () => {
  it('labels speakers and marks interim lines', () => {
    const s = feed([ev('system', 'Question?', true, 1000), ev('mic', 'Answer', true, 5000), ev('system', 'More', false, 9000)])
    expect(formatTranscriptForPrompt(s)).toBe('Interviewer: Question?\nMe (candidate): Answer\nInterviewer: More …')
  })

  it('keeps the most recent lines within the budget', () => {
    const events: SttEvent[] = []
    for (let i = 0; i < 50; i++) events.push(ev(i % 2 ? 'mic' : 'system', `sentence number ${i}`, true, i * 10_000))
    const out = formatTranscriptForPrompt(feed(events), 200)
    expect(out.length).toBeLessThanOrEqual(220)
    expect(out.startsWith('[...]')).toBe(true)
    expect(out.endsWith('sentence number 49')).toBe(true)
  })

  it('truncates a single very long line from the start', () => {
    const s = feed([ev('system', 'x'.repeat(500) + ' END', true, 1)])
    const out = formatTranscriptForPrompt(s, 100)
    expect(out.startsWith('[...]')).toBe(true)
    expect(out.endsWith('END')).toBe(true)
  })
})

describe('clearTranscript', () => {
  it('drops everything but keeps ids increasing', () => {
    const s = feed([ev('system', 'a', true, 1), ev('mic', 'b', false, 2)])
    const c = clearTranscript(s)
    expect(c.segments).toHaveLength(0)
    expect(c.interim).toEqual({})
    const next = applySttEvent(c, ev('system', 'c', true, 3))
    expect(next.segments[0].id).not.toBe(s.segments[0].id)
  })
})
