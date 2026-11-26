// i18n mínimo y sin dependencias. Las cadenas viven en este archivo para que
// TypeScript obligue a que ambos idiomas tengan exactamente las mismas claves.

import type { UiLanguage, UiLanguageSetting } from './types'

const en = {
  'app.name': 'ChuletAI',
  'app.simulated': 'Simulated',
  'app.simulatedHint': 'Simulation mode: transcript and answers are fake. Add your keys in Settings.',
  'app.private': 'Private',
  'app.privateOn': 'Private mode on: hidden from screen sharing',
  'app.privateOff': 'Private mode off: visible when sharing your screen',

  'session.start': 'Start',
  'session.stop': 'Stop',
  'session.listening': 'Listening',
  'session.idle': 'Not listening',
  'session.language': 'Interview language',
  'lang.en': 'English',
  'lang.es': 'Spanish',
  'lang.auto': 'Auto / mixed',
  'lang.short.en': 'EN',
  'lang.short.es': 'ES',
  'lang.short.auto': 'Auto',

  'channel.system': 'System audio',
  'channel.mic': 'Microphone',
  'speaker.interviewer': 'Interviewer',
  'speaker.me': 'Me',

  'transcript.title': 'Transcript',
  'transcript.empty': 'Press Start and the call will be transcribed here.',
  'transcript.clear': 'Clear transcript',
  'transcript.collapse': 'Collapse',
  'transcript.expand': 'Expand',

  'action.help': 'Help me',
  'action.screen': 'Analyze screen',
  'action.direct': 'Ask',
  'action.directPlaceholder': 'Type a question…',
  'action.translate': 'Translate to {lang}',
  'action.stop': 'Stop',
  'action.copy': 'Copy',
  'action.copied': 'Copied',

  'answers.title': 'Answers',
  'answers.empty': 'Press "Help me" ({key}) when the interviewer asks something.',
  'answers.clear': 'Clear answers',
  'answers.prev': 'Previous answer',
  'answers.next': 'Next answer',
  'answers.thinking': 'Thinking…',
  'answers.noQuestion': 'There is no interviewer question in the transcript yet.',
  'answers.error': 'Error: {message}',
  'answers.kind.help': 'Help',
  'answers.kind.screen': 'Screen',
  'answers.kind.direct': 'Question',
  'answers.kind.translate': 'Translation',

  'toolbar.settings': 'Settings',
  'toolbar.hide': 'Hide ({key})',
  'toolbar.quit': 'Quit',
  'toolbar.quitHint': 'Quit ChuletAI (closes it completely)',
  'general.quit': 'Quit ChuletAI',

  'settings.title': 'ChuletAI settings',
  'settings.tab.context': 'Interview',
  'settings.tab.ai': 'AI',
  'settings.tab.transcription': 'Transcription',
  'settings.tab.general': 'General',
  'settings.tab.shortcuts': 'Shortcuts',
  'settings.saved': 'Saved',
  'settings.save': 'Save',

  'context.company': 'Company',
  'context.role': 'Role / position',
  'context.jobDescription': 'Job description',
  'context.resume': 'Resume / CV',
  'context.resumeLoad': 'Load PDF or text…',
  'context.resumeLoaded': 'Loaded: {name}',
  'context.resumeChars': '{count} characters',
  'context.resumeError': 'Could not read the file: {message}',
  'context.notes': 'Notes (achievements, stories, salary range, questions to ask…)',
  'context.clear': 'Clear interview context',

  'ai.provider': 'AI provider',
  'ai.provider.anthropic': 'Claude (Anthropic)',
  'ai.provider.gemini': 'Gemini (Google)',
  'ai.model': 'Model',
  'ai.effort': 'Reasoning effort',
  'ai.effort.low': 'Low (fastest)',
  'ai.effort.medium': 'Medium',
  'ai.effort.high': 'High (slowest)',
  'ai.answerLength': 'Answer length',
  'ai.answerLength.short': 'Short',
  'ai.answerLength.medium': 'Medium',
  'ai.anthropicKey': 'Anthropic API key',
  'ai.geminiKey': 'Google Gemini API key',

  'stt.provider': 'Transcription service',
  'stt.deepgramKey': 'Deepgram API key',
  'stt.note': 'Deepgram Nova-3. In "Auto / mixed" mode it understands English and Spanish in the same sentence.',

  'keys.placeholder': 'Paste the key here',
  'keys.saved': 'Key saved (encrypted)',
  'keys.savedHint': 'Key saved (encrypted) · ends in …{hint}',
  'keys.saving': 'Saving…',
  'keys.help': 'Paste the key and press Enter (it is also saved when you leave the field).',
  'keys.missing': 'No key',
  'keys.remove': 'Remove',
  'keys.encryptionUnavailable': 'Encryption is not available on this system; keys cannot be saved.',

  'general.uiLanguage': 'Interface language',
  'general.uiLanguage.system': 'System default',
  'general.simulation': 'Simulation mode (no keys, fake data)',
  'general.privateMode': 'Private mode (hide from screen sharing)',
  'general.opacity': 'Opacity',
  'general.modifier': 'Shortcut modifier',
  'general.modifier.ctrl': 'Ctrl',
  'general.modifier.ctrlAlt': 'Ctrl+Alt',
  'general.modifierNote': 'Global shortcuts take over these keys in every app while ChuletAI runs. Use Ctrl+Alt if they get in the way.',

  'shortcut.help': 'Help me (answer the last question)',
  'shortcut.screen': 'Analyze screen',
  'shortcut.toggleVisibility': 'Hide / show',
  'shortcut.move': 'Move the window',
  'shortcut.navigate': 'Previous / next answer',
  'shortcut.clearTranscript': 'Clear transcript',
  'shortcut.clearAnswers': 'Clear answers',
  'shortcut.focusInput': 'Make interactive and type a question',

  'tray.show': 'Show / hide',
  'tray.settings': 'Settings…',
  'tray.quit': 'Quit ChuletAI',

  'error.noKey': 'Missing {name} key. Add it in Settings or turn on simulation mode.',
  'error.audio': 'Could not capture audio: {message}'
} as const

export type MessageKey = keyof typeof en
type Dictionary = Record<MessageKey, string>

const es: Dictionary = {
  'app.name': 'ChuletAI',
  'app.simulated': 'Simulado',
  'app.simulatedHint': 'Modo simulado: la transcripción y las respuestas son de mentira. Pon tus claves en Ajustes.',
  'app.private': 'Privado',
  'app.privateOn': 'Modo privado activo: oculto al compartir pantalla',
  'app.privateOff': 'Modo privado apagado: se ve al compartir pantalla',

  'session.start': 'Iniciar',
  'session.stop': 'Detener',
  'session.listening': 'Escuchando',
  'session.idle': 'Sin escuchar',
  'session.language': 'Idioma de la entrevista',
  'lang.en': 'Inglés',
  'lang.es': 'Español',
  'lang.auto': 'Automático / mixto',
  'lang.short.en': 'EN',
  'lang.short.es': 'ES',
  'lang.short.auto': 'Auto',

  'channel.system': 'Audio del sistema',
  'channel.mic': 'Micrófono',
  'speaker.interviewer': 'Entrevistador',
  'speaker.me': 'Yo',

  'transcript.title': 'Transcripción',
  'transcript.empty': 'Pulsa Iniciar y la llamada se transcribirá aquí.',
  'transcript.clear': 'Limpiar transcripción',
  'transcript.collapse': 'Minimizar',
  'transcript.expand': 'Expandir',

  'action.help': 'Ayúdame',
  'action.screen': 'Analizar pantalla',
  'action.direct': 'Preguntar',
  'action.directPlaceholder': 'Escribe una pregunta…',
  'action.translate': 'Traducir al {lang}',
  'action.stop': 'Detener',
  'action.copy': 'Copiar',
  'action.copied': 'Copiado',

  'answers.title': 'Respuestas',
  'answers.empty': 'Pulsa "Ayúdame" ({key}) cuando el entrevistador pregunte algo.',
  'answers.clear': 'Limpiar respuestas',
  'answers.prev': 'Respuesta anterior',
  'answers.next': 'Respuesta siguiente',
  'answers.thinking': 'Pensando…',
  'answers.noQuestion': 'Todavía no hay una pregunta del entrevistador en la transcripción.',
  'answers.error': 'Error: {message}',
  'answers.kind.help': 'Ayuda',
  'answers.kind.screen': 'Pantalla',
  'answers.kind.direct': 'Pregunta',
  'answers.kind.translate': 'Traducción',

  'toolbar.settings': 'Ajustes',
  'toolbar.hide': 'Ocultar ({key})',
  'toolbar.quit': 'Salir',
  'toolbar.quitHint': 'Salir de ChuletAI (la cierra del todo)',
  'general.quit': 'Salir de ChuletAI',

  'settings.title': 'Ajustes de ChuletAI',
  'settings.tab.context': 'Entrevista',
  'settings.tab.ai': 'IA',
  'settings.tab.transcription': 'Transcripción',
  'settings.tab.general': 'General',
  'settings.tab.shortcuts': 'Atajos',
  'settings.saved': 'Guardado',
  'settings.save': 'Guardar',

  'context.company': 'Empresa',
  'context.role': 'Cargo',
  'context.jobDescription': 'Descripción del cargo',
  'context.resume': 'Hoja de vida / CV',
  'context.resumeLoad': 'Cargar PDF o texto…',
  'context.resumeLoaded': 'Cargado: {name}',
  'context.resumeChars': '{count} caracteres',
  'context.resumeError': 'No se pudo leer el archivo: {message}',
  'context.notes': 'Notas (logros, historias, rango salarial, preguntas para hacer…)',
  'context.clear': 'Borrar el contexto de la entrevista',

  'ai.provider': 'Proveedor de IA',
  'ai.provider.anthropic': 'Claude (Anthropic)',
  'ai.provider.gemini': 'Gemini (Google)',
  'ai.model': 'Modelo',
  'ai.effort': 'Esfuerzo de razonamiento',
  'ai.effort.low': 'Bajo (más rápido)',
  'ai.effort.medium': 'Medio',
  'ai.effort.high': 'Alto (más lento)',
  'ai.answerLength': 'Largo de las respuestas',
  'ai.answerLength.short': 'Cortas',
  'ai.answerLength.medium': 'Medianas',
  'ai.anthropicKey': 'Clave de API de Anthropic',
  'ai.geminiKey': 'Clave de API de Google Gemini',

  'stt.provider': 'Servicio de transcripción',
  'stt.deepgramKey': 'Clave de API de Deepgram',
  'stt.note': 'Deepgram Nova-3. En modo "Automático / mixto" entiende inglés y español en la misma frase.',

  'keys.placeholder': 'Pega la clave aquí',
  'keys.saved': 'Clave guardada (cifrada)',
  'keys.savedHint': 'Clave guardada (cifrada) · termina en …{hint}',
  'keys.saving': 'Guardando…',
  'keys.help': 'Pega la clave y pulsa Enter (también se guarda al salir del campo).',
  'keys.missing': 'Sin clave',
  'keys.remove': 'Quitar',
  'keys.encryptionUnavailable': 'El cifrado no está disponible en este sistema; no se pueden guardar claves.',

  'general.uiLanguage': 'Idioma de la interfaz',
  'general.uiLanguage.system': 'El del sistema',
  'general.simulation': 'Modo simulado (sin claves, datos de prueba)',
  'general.privateMode': 'Modo privado (oculto al compartir pantalla)',
  'general.opacity': 'Opacidad',
  'general.modifier': 'Tecla de los atajos',
  'general.modifier.ctrl': 'Ctrl',
  'general.modifier.ctrlAlt': 'Ctrl+Alt',
  'general.modifierNote': 'Los atajos globales se adueñan de esas teclas en todas las apps mientras ChuletAI está abierta. Usa Ctrl+Alt si te estorban.',

  'shortcut.help': 'Ayúdame (responder a la última pregunta)',
  'shortcut.screen': 'Analizar pantalla',
  'shortcut.toggleVisibility': 'Ocultar / mostrar',
  'shortcut.move': 'Mover la ventana',
  'shortcut.navigate': 'Respuesta anterior / siguiente',
  'shortcut.clearTranscript': 'Limpiar transcripción',
  'shortcut.clearAnswers': 'Limpiar respuestas',
  'shortcut.focusInput': 'Volver interactiva y escribir una pregunta',

  'tray.show': 'Mostrar / ocultar',
  'tray.settings': 'Ajustes…',
  'tray.quit': 'Salir de ChuletAI',

  'error.noKey': 'Falta la clave de {name}. Agrégala en Ajustes o activa el modo simulado.',
  'error.audio': 'No se pudo capturar el audio: {message}'
}

export const dictionaries: Record<UiLanguage, Dictionary> = { en, es }

/** Resuelve el idioma de la interfaz a partir del ajuste y del idioma del sistema (p. ej. "es-CO"). */
export function resolveUiLanguage(setting: UiLanguageSetting, systemLocale: string): UiLanguage {
  if (setting === 'en' || setting === 'es') return setting
  return systemLocale.toLowerCase().startsWith('es') ? 'es' : 'en'
}

export type Translator = (key: MessageKey, vars?: Record<string, string | number>) => string

export function createTranslator(lang: UiLanguage): Translator {
  const dict = dictionaries[lang]
  return (key, vars) => {
    const template = dict[key] ?? dictionaries.en[key] ?? key
    if (!vars) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
    )
  }
}
