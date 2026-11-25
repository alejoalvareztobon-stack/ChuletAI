// Hooks compartidos por las dos ventanas: ajustes, estado y traductor.

import { useEffect, useMemo, useState } from 'react'
import type { ChuletApi } from '../../shared/api'
import { createTranslator, resolveUiLanguage, type Translator } from '../../shared/i18n'
import type { RuntimeStatus, Settings, UiLanguage } from '../../shared/types'

declare global {
  interface Window {
    chuletai: ChuletApi
  }
}

export const api = (): ChuletApi => window.chuletai

export function useSettings(): {
  settings: Settings | null
  status: RuntimeStatus | null
  lang: UiLanguage
  t: Translator
  update: (patch: Partial<Settings>) => Promise<Settings>
} {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [status, setStatus] = useState<RuntimeStatus | null>(null)

  useEffect(() => {
    void api().getSettings().then(setSettings)
    void api().getStatus().then(setStatus)
    const off1 = api().on('settings:changed', setSettings)
    const off2 = api().on('status:changed', setStatus)
    return () => {
      off1()
      off2()
    }
  }, [])

  const lang = resolveUiLanguage(settings?.uiLanguage ?? 'system', status?.systemLocale ?? navigator.language)
  const t = useMemo(() => createTranslator(lang), [lang])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  return { settings, status, lang, t, update: (patch) => api().updateSettings(patch) }
}
