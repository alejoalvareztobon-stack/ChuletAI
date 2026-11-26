import { useEffect, useState } from 'react'
import type { MessageKey } from '../../../shared/i18n'
import { shortcutLabel } from '../../../shared/shortcuts'
import type { InterviewContext, KeyName, Settings, ShortcutAction } from '../../../shared/types'
import { api, useSettings } from '../useApp'

type Tab = 'context' | 'ai' | 'transcription' | 'general' | 'shortcuts'
const TABS: Tab[] = ['context', 'ai', 'transcription', 'general', 'shortcuts']

function KeyField({ name, label }: { name: KeyName; label: string }) {
  const { status, t } = useSettings()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  if (!status) return null
  const has = status.keys[name]
  const hint = status.keyHints?.[name]
  const save = async (v: string): Promise<void> => {
    if (saving) return
    try {
      setError('')
      setSaving(true)
      await api().setKey(name, v)
      setValue('')
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="field">
      <label>{label}</label>
      {/* Se guarda con Enter, con el botón o al salir del campo (como el resto de Ajustes). */}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          if (value.trim()) void save(value)
        }}
      >
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={has ? `••••••••••••${hint ?? ''}` : t('keys.placeholder')}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => value.trim() && void save(value)}
          disabled={!status.encryptionAvailable}
        />
        <button className="btn primary" type="submit" disabled={!value.trim() || saving}>
          {t('settings.save')}
        </button>
        {has && (
          <button className="btn" type="button" onClick={() => void save('')}>
            {t('keys.remove')}
          </button>
        )}
      </form>
      <small className={has ? 'ok' : 'muted'}>
        {saving ? t('keys.saving') : has ? `✓ ${hint ? t('keys.savedHint', { hint }) : t('keys.saved')}` : `${t('keys.missing')} — ${t('keys.help')}`}
      </small>
      {!status.encryptionAvailable && <small className="error">{t('keys.encryptionUnavailable')}</small>}
      {error && <small className="error">{error}</small>}
    </div>
  )
}

/** Campo de texto que guarda al salir (y con un pequeño retardo mientras se escribe). */
function ContextField({
  field,
  label,
  multiline,
  rows,
  settings,
  update
}: {
  field: keyof InterviewContext
  label: string
  multiline?: boolean
  rows?: number
  settings: Settings
  update: (patch: Partial<Settings>) => Promise<Settings>
}) {
  const [value, setValue] = useState(settings.context[field])
  useEffect(() => setValue(settings.context[field]), [settings.context, field])
  useEffect(() => {
    if (value === settings.context[field]) return
    const timer = setTimeout(() => void update({ context: { ...settings.context, [field]: value } }), 600)
    return () => clearTimeout(timer)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="field">
      <label>{label}</label>
      {multiline ? (
        <textarea rows={rows ?? 6} value={value} onChange={(e) => setValue(e.target.value)} />
      ) : (
        <input value={value} onChange={(e) => setValue(e.target.value)} />
      )}
    </div>
  )
}

export function SettingsApp() {
  const { settings, status, t, update } = useSettings()
  const [tab, setTab] = useState<Tab>('context')
  const [resumeMsg, setResumeMsg] = useState('')

  useEffect(() => {
    document.title = t('settings.title')
  }, [t])

  if (!settings || !status) return null
  const mod = settings.shortcutModifier

  const shortcutRows: Array<[MessageKey, string]> = [
    ['shortcut.help', shortcutLabel('help', mod)],
    ['shortcut.screen', shortcutLabel('screen', mod)],
    ['shortcut.toggleVisibility', shortcutLabel('toggleVisibility', mod)],
    ['shortcut.move', (['moveUp', 'moveDown', 'moveLeft', 'moveRight'] as ShortcutAction[]).map((a) => shortcutLabel(a, mod)).join('  ')],
    ['shortcut.navigate', `${shortcutLabel('prevAnswer', mod)}  ${shortcutLabel('nextAnswer', mod)}`],
    ['shortcut.clearTranscript', shortcutLabel('clearTranscript', mod)],
    ['shortcut.clearAnswers', shortcutLabel('clearAnswers', mod)],
    ['shortcut.focusInput', shortcutLabel('focusInput', mod)]
  ]

  return (
    <div className="settings">
      <nav className="tabs">
        <h1>ChuletAI</h1>
        {TABS.map((id) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {t(`settings.tab.${id}`)}
          </button>
        ))}
        <span className="spacer" />
        {(status.aiMode === 'mock' || status.sttMode === 'mock') && <p className="badge warn">{t('app.simulatedHint')}</p>}
      </nav>

      <main className="pane">
        {tab === 'context' && (
          <>
            <div className="field">
              <label>{t('session.language')}</label>
              <select
                value={settings.interviewLanguage}
                onChange={(e) => void update({ interviewLanguage: e.target.value as Settings['interviewLanguage'] })}
              >
                <option value="en">{t('lang.en')}</option>
                <option value="es">{t('lang.es')}</option>
                <option value="auto">{t('lang.auto')}</option>
              </select>
            </div>
            <div className="grid2">
              <ContextField field="company" label={t('context.company')} settings={settings} update={update} />
              <ContextField field="role" label={t('context.role')} settings={settings} update={update} />
            </div>
            <ContextField field="jobDescription" label={t('context.jobDescription')} multiline rows={6} settings={settings} update={update} />
            <div className="field">
              <label>{t('context.resume')}</label>
              <div className="row">
                <button
                  className="btn"
                  onClick={async () => {
                    const res = await api().pickResume()
                    if (!res) return
                    if ('error' in res) {
                      setResumeMsg(t('context.resumeError', { message: res.error }))
                      return
                    }
                    await update({ context: { ...settings.context, resume: res.text, resumeFileName: res.name } })
                    setResumeMsg(t('context.resumeLoaded', { name: res.name }))
                  }}
                >
                  {t('context.resumeLoad')}
                </button>
                <small className="muted">
                  {settings.context.resumeFileName && `${t('context.resumeLoaded', { name: settings.context.resumeFileName })} · `}
                  {t('context.resumeChars', { count: settings.context.resume.length })}
                </small>
              </div>
              {resumeMsg && <small className="muted">{resumeMsg}</small>}
            </div>
            <ContextField field="resume" label="" multiline rows={8} settings={settings} update={update} />
            <ContextField field="notes" label={t('context.notes')} multiline rows={5} settings={settings} update={update} />
            <button
              className="btn danger"
              onClick={() =>
                void update({
                  context: { company: '', role: '', jobDescription: '', resume: '', resumeFileName: '', notes: '' }
                })
              }
            >
              {t('context.clear')}
            </button>
          </>
        )}

        {tab === 'ai' && (
          <>
            <div className="field">
              <label>{t('ai.provider')}</label>
              <select value={settings.aiProvider} onChange={(e) => void update({ aiProvider: e.target.value as Settings['aiProvider'] })}>
                <option value="anthropic">{t('ai.provider.anthropic')}</option>
                <option value="gemini">{t('ai.provider.gemini')}</option>
              </select>
            </div>
            {settings.aiProvider === 'anthropic' ? (
              <>
                <div className="field">
                  <label>{t('ai.model')}</label>
                  <input
                    defaultValue={settings.anthropicModel}
                    onBlur={(e) => void update({ anthropicModel: e.target.value })}
                    spellCheck={false}
                  />
                </div>
                <div className="field">
                  <label>{t('ai.effort')}</label>
                  <select value={settings.effort} onChange={(e) => void update({ effort: e.target.value as Settings['effort'] })}>
                    <option value="low">{t('ai.effort.low')}</option>
                    <option value="medium">{t('ai.effort.medium')}</option>
                    <option value="high">{t('ai.effort.high')}</option>
                  </select>
                </div>
                <KeyField name="anthropic" label={t('ai.anthropicKey')} />
              </>
            ) : (
              <>
                <div className="field">
                  <label>{t('ai.model')}</label>
                  <input defaultValue={settings.geminiModel} onBlur={(e) => void update({ geminiModel: e.target.value })} spellCheck={false} />
                </div>
                <KeyField name="gemini" label={t('ai.geminiKey')} />
              </>
            )}
            <div className="field">
              <label>{t('ai.answerLength')}</label>
              <select value={settings.answerLength} onChange={(e) => void update({ answerLength: e.target.value as Settings['answerLength'] })}>
                <option value="short">{t('ai.answerLength.short')}</option>
                <option value="medium">{t('ai.answerLength.medium')}</option>
              </select>
            </div>
          </>
        )}

        {tab === 'transcription' && (
          <>
            <div className="field">
              <label>{t('stt.provider')}</label>
              <select value="deepgram" disabled>
                <option value="deepgram">Deepgram Nova-3</option>
              </select>
              <small className="muted">{t('stt.note')}</small>
            </div>
            <KeyField name="deepgram" label={t('stt.deepgramKey')} />
          </>
        )}

        {tab === 'general' && (
          <>
            <div className="field">
              <label>{t('general.uiLanguage')}</label>
              <select value={settings.uiLanguage} onChange={(e) => void update({ uiLanguage: e.target.value as Settings['uiLanguage'] })}>
                <option value="system">{t('general.uiLanguage.system')}</option>
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </div>
            <label className="check">
              <input type="checkbox" checked={settings.privateMode} onChange={(e) => void update({ privateMode: e.target.checked })} />
              {t('general.privateMode')}
            </label>
            <label className="check">
              <input type="checkbox" checked={settings.simulation} onChange={(e) => void update({ simulation: e.target.checked })} />
              {t('general.simulation')}
            </label>
            <div className="field">
              <label>
                {t('general.opacity')} ({Math.round(settings.opacity * 100)}%)
              </label>
              <input
                type="range"
                min={0.4}
                max={1}
                step={0.02}
                value={settings.opacity}
                onChange={(e) => void update({ opacity: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>{t('general.modifier')}</label>
              <select
                value={settings.shortcutModifier}
                onChange={(e) => void update({ shortcutModifier: e.target.value as Settings['shortcutModifier'] })}
              >
                <option value="Control">{t('general.modifier.ctrl')}</option>
                <option value="Control+Alt">{t('general.modifier.ctrlAlt')}</option>
              </select>
              <small className="muted">{t('general.modifierNote')}</small>
            </div>
          </>
        )}

        {tab === 'shortcuts' && (
          <table className="shortcuts">
            <tbody>
              {shortcutRows.map(([key, label]) => (
                <tr key={key}>
                  <td>{t(key)}</td>
                  <td>
                    <kbd>{label}</kbd>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  )
}
