// Tipos compartidos entre el proceso main, el preload y el renderer.

export type UiLanguage = 'en' | 'es'
export type UiLanguageSetting = UiLanguage | 'system'
/** Idioma de la entrevista: fija el idioma de transcripción y de las respuestas. */
export type InterviewLanguage = 'en' | 'es' | 'auto'

export type AiProviderId = 'anthropic' | 'gemini'
export type TranscriberId = 'deepgram'
export type Effort = 'low' | 'medium' | 'high'
export type AnswerLength = 'short' | 'medium'
export type ShortcutModifier = 'Control' | 'Control+Alt'

export type Speaker = 'interviewer' | 'me'
export type AudioChannel = 'system' | 'mic'

export const CHANNEL_SPEAKER: Record<AudioChannel, Speaker> = {
  system: 'interviewer',
  mic: 'me'
}

export interface InterviewContext {
  company: string
  role: string
  jobDescription: string
  resume: string
  resumeFileName: string
  notes: string
}

export interface Settings {
  uiLanguage: UiLanguageSetting
  interviewLanguage: InterviewLanguage
  aiProvider: AiProviderId
  anthropicModel: string
  effort: Effort
  geminiModel: string
  transcriber: TranscriberId
  /** Fuerza el modo simulado aunque haya claves. */
  simulation: boolean
  privateMode: boolean
  shortcutModifier: ShortcutModifier
  answerLength: AnswerLength
  opacity: number
  showTranscript: boolean
  context: InterviewContext
}

export type KeyName = 'anthropic' | 'gemini' | 'deepgram'
export type KeyStatus = Record<KeyName, boolean>

export interface RuntimeStatus {
  /** El proveedor de IA real o 'mock' si no hay clave o la simulación está activa. */
  aiMode: 'live' | 'mock'
  sttMode: 'live' | 'mock'
  keys: KeyStatus
  encryptionAvailable: boolean
  systemLocale: string
}

export type AiAction = 'help' | 'screen' | 'direct' | 'translate'

export interface TranscriptSegment {
  id: string
  speaker: Speaker
  text: string
  final: boolean
  start: number
  end: number
}

/** Evento de transcripción emitido por el proceso main (Deepgram o simulado). */
export interface SttEvent {
  channel: AudioChannel
  text: string
  isFinal: boolean
  ts: number
}

export interface SttStatus {
  channel: AudioChannel
  state: 'idle' | 'connecting' | 'open' | 'error' | 'closed'
  message?: string
}

export interface AiRunRequest {
  id: string
  action: AiAction
  /** Transcripción ya formateada para el prompt. */
  transcript: string
  /** Última intervención del entrevistador. */
  lastQuestion: string
  /** Texto libre del usuario (mensaje directo). */
  userMessage?: string
  /** Respuesta a traducir (acción translate). */
  sourceText?: string
  targetLanguage?: 'en' | 'es'
}

export interface AiDelta {
  id: string
  text: string
}

export interface AiDone {
  id: string
  error?: string
  /** El modo con el que se resolvió (útil para mostrar "simulado"). */
  mode: 'live' | 'mock'
}

export type ShortcutAction =
  | 'help'
  | 'screen'
  | 'toggleVisibility'
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'prevAnswer'
  | 'nextAnswer'
  | 'clearTranscript'
  | 'clearAnswers'
  | 'focusInput'

export const DEFAULT_CONTEXT: InterviewContext = {
  company: '',
  role: '',
  jobDescription: '',
  resume: '',
  resumeFileName: '',
  notes: ''
}

export const DEFAULT_SETTINGS: Settings = {
  uiLanguage: 'system',
  interviewLanguage: 'auto',
  aiProvider: 'anthropic',
  anthropicModel: 'claude-haiku-5-5',
  effort: 'low',
  geminiModel: 'gemini-flash-latest',
  transcriber: 'deepgram',
  simulation: false,
  privateMode: true,
  shortcutModifier: 'Control',
  answerLength: 'short',
  opacity: 0.94,
  showTranscript: true,
  context: DEFAULT_CONTEXT
}

/** Mezcla ajustes guardados con los valores por defecto (tolera archivos viejos o incompletos). */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>
  const ctx = (r.context && typeof r.context === 'object' ? r.context : {}) as Partial<InterviewContext>
  const pick = <T,>(value: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback
  const str = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback)
  const opacity = typeof r.opacity === 'number' && r.opacity >= 0.3 && r.opacity <= 1 ? r.opacity : DEFAULT_SETTINGS.opacity
  return {
    uiLanguage: pick(r.uiLanguage, ['en', 'es', 'system'] as const, DEFAULT_SETTINGS.uiLanguage),
    interviewLanguage: pick(r.interviewLanguage, ['en', 'es', 'auto'] as const, DEFAULT_SETTINGS.interviewLanguage),
    aiProvider: pick(r.aiProvider, ['anthropic', 'gemini'] as const, DEFAULT_SETTINGS.aiProvider),
    anthropicModel: str(r.anthropicModel, DEFAULT_SETTINGS.anthropicModel).trim() || DEFAULT_SETTINGS.anthropicModel,
    effort: pick(r.effort, ['low', 'medium', 'high'] as const, DEFAULT_SETTINGS.effort),
    geminiModel: str(r.geminiModel, DEFAULT_SETTINGS.geminiModel).trim() || DEFAULT_SETTINGS.geminiModel,
    transcriber: 'deepgram',
    simulation: typeof r.simulation === 'boolean' ? r.simulation : DEFAULT_SETTINGS.simulation,
    privateMode: typeof r.privateMode === 'boolean' ? r.privateMode : DEFAULT_SETTINGS.privateMode,
    shortcutModifier: pick(r.shortcutModifier, ['Control', 'Control+Alt'] as const, DEFAULT_SETTINGS.shortcutModifier),
    answerLength: pick(r.answerLength, ['short', 'medium'] as const, DEFAULT_SETTINGS.answerLength),
    opacity,
    showTranscript: typeof r.showTranscript === 'boolean' ? r.showTranscript : DEFAULT_SETTINGS.showTranscript,
    context: {
      company: str(ctx.company, ''),
      role: str(ctx.role, ''),
      jobDescription: str(ctx.jobDescription, ''),
      resume: str(ctx.resume, ''),
      resumeFileName: str(ctx.resumeFileName, ''),
      notes: str(ctx.notes, '')
    }
  }
}
