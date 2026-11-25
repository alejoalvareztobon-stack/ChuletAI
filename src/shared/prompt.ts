// Armado de prompts (lógica pura). Las plantillas viven en src/shared/prompts/*.md.

import type { AiAction, AiRunRequest, AnswerLength, Effort, InterviewContext, InterviewLanguage } from './types'

export const TEMPLATE_NAMES = [
  'system',
  'help',
  'help-no-question',
  'screen',
  'direct',
  'translate',
  'lang-en',
  'lang-es',
  'lang-auto',
  'length-short',
  'length-medium'
] as const

export type TemplateName = (typeof TEMPLATE_NAMES)[number]
export type PromptTemplates = Record<TemplateName, string>

const NOT_PROVIDED = '(not provided)'

/** Sustituye {{variable}}. Las variables que faltan quedan vacías. */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, name: string) => vars[name] ?? '')
}

function orNotProvided(value: string, maxChars: number): string {
  const v = value.trim()
  if (!v) return NOT_PROVIDED
  return v.length > maxChars ? `${v.slice(0, maxChars)}\n[...truncated]` : v
}

export interface SystemPromptInput {
  context: InterviewContext
  interviewLanguage: InterviewLanguage
  answerLength: AnswerLength
}

/**
 * Prompt del sistema: estable durante toda la sesión (bueno para el caché de prompts).
 * Lleva las reglas de estilo, el idioma y todo el contexto de la entrevista.
 */
export function buildSystemPrompt(t: PromptTemplates, input: SystemPromptInput): string {
  const { context } = input
  const languageRule = t[`lang-${input.interviewLanguage}` as TemplateName].trim()
  const lengthRule = t[`length-${input.answerLength}` as TemplateName].trim()
  return fillTemplate(t.system, {
    languageRule,
    lengthRule,
    company: orNotProvided(context.company, 200),
    role: orNotProvided(context.role, 200),
    jobDescription: orNotProvided(context.jobDescription, 12000),
    resume: orNotProvided(context.resume, 20000),
    notes: orNotProvided(context.notes, 8000)
  }).trim()
}

export const LANGUAGE_NAME: Record<'en' | 'es', string> = { en: 'English', es: 'Spanish' }

/** Mensaje de usuario según la acción. */
export function buildUserPrompt(t: PromptTemplates, req: AiRunRequest): string {
  const transcript = req.transcript.trim() || '(no transcript yet)'
  switch (req.action) {
    case 'help':
      if (!req.lastQuestion.trim()) return fillTemplate(t['help-no-question'], { transcript }).trim()
      return fillTemplate(t.help, { transcript, lastQuestion: req.lastQuestion.trim() }).trim()
    case 'screen':
      return fillTemplate(t.screen, { transcript }).trim()
    case 'direct':
      return fillTemplate(t.direct, { transcript, userMessage: (req.userMessage ?? '').trim() }).trim()
    case 'translate':
      return fillTemplate(t.translate, {
        targetLanguageName: LANGUAGE_NAME[req.targetLanguage ?? 'en'],
        sourceText: (req.sourceText ?? '').trim()
      }).trim()
  }
}

const EFFORT_ORDER: Effort[] = ['low', 'medium', 'high']

/**
 * Esfuerzo por acción: el del usuario, salvo "Analizar pantalla", que suele ser un
 * problema de código y se beneficia de al menos 'medium'. Traducir siempre va en 'low'.
 */
export function effortForAction(action: AiAction, base: Effort): Effort {
  if (action === 'translate') return 'low'
  if (action === 'screen') return EFFORT_ORDER[Math.max(EFFORT_ORDER.indexOf(base), 1)]
  return base
}

/** Idioma en el que esperamos la respuesta (para el modo simulado y la opción de traducir). */
export function guessLanguage(text: string): 'en' | 'es' {
  const t = ` ${text.toLowerCase()} `
  const es = (t.match(/[áéíóúñ¿¡]| (el|la|los|las|que|de|en|por|para|con|una|cómo|qué|usted|tu|tú|mi|es|y) /g) ?? []).length
  const en = (t.match(/ (the|and|you|your|what|how|is|are|of|to|in|for|with|my|i|tell|me) /g) ?? []).length
  return es > en ? 'es' : 'en'
}

/** Idioma de salida esperado para una acción. */
export function expectedAnswerLanguage(
  interviewLanguage: InterviewLanguage,
  req: Pick<AiRunRequest, 'action' | 'lastQuestion' | 'userMessage' | 'transcript' | 'targetLanguage'>
): 'en' | 'es' {
  if (req.action === 'translate') return req.targetLanguage ?? 'en'
  if (interviewLanguage !== 'auto') return interviewLanguage
  const sample = req.action === 'direct' ? req.userMessage ?? '' : req.lastQuestion || req.transcript
  return guessLanguage(sample)
}
