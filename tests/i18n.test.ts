import { describe, expect, it } from 'vitest'
import { createTranslator, dictionaries, resolveUiLanguage } from '../src/shared/i18n'
import { acceleratorFor, allAccelerators, shortcutLabel } from '../src/shared/shortcuts'
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/shared/types'

describe('i18n', () => {
  it('both languages have exactly the same keys and no empty strings', () => {
    const en = Object.keys(dictionaries.en).sort()
    const es = Object.keys(dictionaries.es).sort()
    expect(es).toEqual(en)
    for (const lang of ['en', 'es'] as const) {
      for (const [key, value] of Object.entries(dictionaries[lang])) {
        expect(value.trim(), `${lang}:${key}`).not.toBe('')
      }
    }
  })

  it('placeholders match between languages', () => {
    const vars = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort()
    for (const key of Object.keys(dictionaries.en) as Array<keyof typeof dictionaries.en>) {
      expect(vars(dictionaries.es[key]), key).toEqual(vars(dictionaries.en[key]))
    }
  })

  it('Spanish strings are actually translated (spot check)', () => {
    const t = createTranslator('es')
    expect(t('action.help')).toBe('Ayúdame')
    expect(t('action.screen')).toBe('Analizar pantalla')
    expect(createTranslator('en')('action.help')).toBe('Help me')
  })

  it('interpolates variables and leaves unknown ones untouched', () => {
    const t = createTranslator('es')
    expect(t('context.resumeLoaded', { name: 'cv.pdf' })).toBe('Cargado: cv.pdf')
    expect(t('action.translate', { lang: 'EN' })).toBe('Traducir al EN')
    expect(createTranslator('en')('answers.error', {})).toBe('Error: {message}')
  })

  it('resolves the UI language from the setting or the system locale', () => {
    expect(resolveUiLanguage('system', 'es-CO')).toBe('es')
    expect(resolveUiLanguage('system', 'es')).toBe('es')
    expect(resolveUiLanguage('system', 'en-US')).toBe('en')
    expect(resolveUiLanguage('system', 'pt-BR')).toBe('en')
    expect(resolveUiLanguage('en', 'es-ES')).toBe('en')
    expect(resolveUiLanguage('es', 'en-US')).toBe('es')
  })
})

describe('shortcuts', () => {
  it('builds the required accelerators with Ctrl', () => {
    expect(acceleratorFor('help', 'Control')).toBe('Control+Enter')
    expect(acceleratorFor('screen', 'Control')).toBe('Control+Shift+Enter')
    expect(acceleratorFor('toggleVisibility', 'Control')).toBe('Control+H')
    expect(acceleratorFor('moveUp', 'Control')).toBe('Control+Up')
    expect(acceleratorFor('prevAnswer', 'Control')).toBe('Control+Shift+Left')
    expect(acceleratorFor('nextAnswer', 'Control')).toBe('Control+Shift+Right')
    expect(acceleratorFor('clearTranscript', 'Control')).toBe('Control+Backspace')
    expect(acceleratorFor('clearAnswers', 'Control')).toBe('Control+Shift+Backspace')
  })

  it('switches every shortcut to Ctrl+Alt and keeps them unique', () => {
    const list = allAccelerators('Control+Alt')
    expect(list.every((x) => x.accelerator.startsWith('Control+Alt+'))).toBe(true)
    expect(new Set(list.map((x) => x.accelerator)).size).toBe(list.length)
  })

  it('formats readable labels', () => {
    expect(shortcutLabel('moveLeft', 'Control')).toBe('Ctrl+←')
    expect(shortcutLabel('screen', 'Control+Alt')).toBe('Ctrl+Alt+Shift+Enter')
  })
})

describe('settings normalization', () => {
  it('fills defaults and rejects invalid values', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    const s = normalizeSettings({ interviewLanguage: 'fr', effort: 'max', opacity: 5, context: { company: 'X' } })
    expect(s.interviewLanguage).toBe('auto')
    expect(s.effort).toBe('low')
    expect(s.opacity).toBe(DEFAULT_SETTINGS.opacity)
    expect(s.context.company).toBe('X')
    expect(s.context.resume).toBe('')
  })

  it('uses the system default microphone unless one was chosen', () => {
    expect(DEFAULT_SETTINGS.micDeviceId).toBe('')
    expect(normalizeSettings({ micDeviceId: 42 }).micDeviceId).toBe('')
    const s = normalizeSettings({ micDeviceId: 'abc', micLabel: 'Headset' })
    expect([s.micDeviceId, s.micLabel]).toEqual(['abc', 'Headset'])
  })

  it('defaults to Claude Haiku 5.5 with low effort and private mode on', () => {
    expect(DEFAULT_SETTINGS.anthropicModel).toBe('claude-haiku-5-5')
    expect(DEFAULT_SETTINGS.effort).toBe('low')
    expect(DEFAULT_SETTINGS.privateMode).toBe(true)
  })
})
