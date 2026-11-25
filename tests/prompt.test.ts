import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildSystemPrompt,
  buildUserPrompt,
  effortForAction,
  expectedAnswerLanguage,
  fillTemplate,
  guessLanguage,
  TEMPLATE_NAMES,
  type PromptTemplates
} from '../src/shared/prompt'
import { DEFAULT_TEMPLATES } from '../src/shared/prompts'
import { DEFAULT_CONTEXT, type AiRunRequest } from '../src/shared/types'

const t: PromptTemplates = DEFAULT_TEMPLATES

const context = {
  ...DEFAULT_CONTEXT,
  company: 'Acme',
  role: 'Data Analyst',
  jobDescription: 'SQL, Python, dashboards',
  resume: 'Analista de datos en Rappi (2021-2024). Redujo el tiempo de reportes 80%.',
  notes: 'Quiero hablar del proyecto de churn.'
}

const req = (over: Partial<AiRunRequest>): AiRunRequest => ({
  id: 'x',
  action: 'help',
  transcript: 'Interviewer: Tell me about yourself.',
  lastQuestion: 'Tell me about yourself.',
  ...over
})

describe('templates', () => {
  it('ships every template as a non-empty separate .md file', () => {
    for (const name of TEMPLATE_NAMES) {
      const file = readFileSync(join(__dirname, '../src/shared/prompts', `${name}.md`), 'utf8')
      expect(file.trim().length).toBeGreaterThan(10)
      expect(t[name]).toBe(file)
    }
  })

  it('fillTemplate replaces variables and blanks unknown ones', () => {
    expect(fillTemplate('Hi {{ name }}, {{missing}}!', { name: 'Ana' })).toBe('Hi Ana, !')
  })
})

describe('buildSystemPrompt', () => {
  it('includes the whole interview context', () => {
    const p = buildSystemPrompt(t, { context, interviewLanguage: 'en', answerLength: 'short' })
    expect(p).toContain('<company>Acme</company>')
    expect(p).toContain('<role>Data Analyst</role>')
    expect(p).toContain('SQL, Python, dashboards')
    expect(p).toContain('Rappi')
    expect(p).toContain('proyecto de churn')
    expect(p).not.toMatch(/\{\{\w+\}\}/)
  })

  it('asks for first person, short, glanceable answers', () => {
    const p = buildSystemPrompt(t, { context, interviewLanguage: 'en', answerLength: 'short' })
    expect(p).toMatch(/first person/i)
    expect(p).toContain('under 60 words')
    const medium = buildSystemPrompt(t, { context, interviewLanguage: 'en', answerLength: 'medium' })
    expect(medium).toContain('under 120 words')
  })

  it('sets the answer language from the interview language', () => {
    expect(buildSystemPrompt(t, { context, interviewLanguage: 'en', answerLength: 'short' })).toContain(
      'Always answer in English'
    )
    const es = buildSystemPrompt(t, { context, interviewLanguage: 'es', answerLength: 'short' })
    expect(es).toContain('Always answer in Spanish')
    expect(es).toContain('Responde siempre en español')
    expect(buildSystemPrompt(t, { context, interviewLanguage: 'auto', answerLength: 'short' })).toContain(
      'language the interviewer used'
    )
  })

  it('marks missing context as not provided and truncates very long resumes', () => {
    const p = buildSystemPrompt(t, {
      context: { ...DEFAULT_CONTEXT, resume: 'a'.repeat(30_000) },
      interviewLanguage: 'es',
      answerLength: 'short'
    })
    expect(p).toContain('<company>(not provided)</company>')
    expect(p).toContain('[...truncated]')
    expect(p.length).toBeLessThan(26_000)
  })

  it('is stable for the same input (prompt caching)', () => {
    const a = buildSystemPrompt(t, { context, interviewLanguage: 'auto', answerLength: 'short' })
    const b = buildSystemPrompt(t, { context, interviewLanguage: 'auto', answerLength: 'short' })
    expect(a).toBe(b)
  })
})

describe('buildUserPrompt', () => {
  it('help: puts the transcript and the latest question', () => {
    const p = buildUserPrompt(t, req({}))
    expect(p).toContain('<transcript>\nInterviewer: Tell me about yourself.\n</transcript>')
    expect(p).toContain('<latest>\nTell me about yourself.\n</latest>')
  })

  it('help without a question uses the fallback template', () => {
    const p = buildUserPrompt(t, req({ lastQuestion: '  ', transcript: '' }))
    expect(p).toContain('no clear question')
    expect(p).toContain('(no transcript yet)')
  })

  it('screen, direct and translate use their own templates', () => {
    expect(buildUserPrompt(t, req({ action: 'screen' }))).toContain('screenshot')
    const d = buildUserPrompt(t, req({ action: 'direct', userMessage: '¿Qué salario pido?' }))
    expect(d).toContain('<question>\n¿Qué salario pido?\n</question>')
    const tr = buildUserPrompt(t, req({ action: 'translate', sourceText: '**Hola**', targetLanguage: 'en' }))
    expect(tr).toContain('into English')
    expect(tr).toContain('overrides the language rule')
    expect(tr).toContain('**Hola**')
    expect(buildUserPrompt(t, req({ action: 'translate', sourceText: 'Hi', targetLanguage: 'es' }))).toContain(
      'into Spanish'
    )
  })
})

describe('effort and language helpers', () => {
  it('raises effort for screen analysis and lowers it for translation', () => {
    expect(effortForAction('help', 'low')).toBe('low')
    expect(effortForAction('screen', 'low')).toBe('medium')
    expect(effortForAction('screen', 'high')).toBe('high')
    expect(effortForAction('translate', 'high')).toBe('low')
  })

  it('guesses English vs Spanish', () => {
    expect(guessLanguage('Tell me about your experience with the team')).toBe('en')
    expect(guessLanguage('¿Cuéntame de tu experiencia con el equipo?')).toBe('es')
  })

  it('expected answer language follows the interview setting', () => {
    expect(expectedAnswerLanguage('es', req({}))).toBe('es')
    expect(expectedAnswerLanguage('auto', req({ lastQuestion: '¿Por qué quieres este cargo?' }))).toBe('es')
    expect(expectedAnswerLanguage('auto', req({}))).toBe('en')
    expect(expectedAnswerLanguage('es', req({ action: 'translate', targetLanguage: 'en' }))).toBe('en')
  })
})
