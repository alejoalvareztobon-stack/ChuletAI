import { useCallback, useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { guessLanguage } from '../../../shared/prompt'
import { shortcutLabel } from '../../../shared/shortcuts'
import {
  applySttEvent,
  clearTranscript,
  createTranscript,
  formatTranscriptForPrompt,
  lastInterviewerTurn,
  visibleSegments,
  type TranscriptState
} from '../../../shared/transcript'
import type { AiAction, AudioChannel, InterviewLanguage, SttStatus } from '../../../shared/types'
import { startAudioCapture, type AudioCapture } from '../audio'
import { api, useSettings } from '../useApp'

interface Answer {
  id: string
  action: AiAction
  label: string
  text: string
  status: 'streaming' | 'done' | 'error'
  error?: string
  mode?: 'live' | 'mock'
}

let counter = 0
let mouseMoves = 0
const newId = (): string => `a${Date.now().toString(36)}${(counter++).toString(36)}`

export function Overlay() {
  const { settings, status, t, update } = useSettings()
  const [transcript, setTranscript] = useState<TranscriptState>(createTranscript)
  const transcriptRef = useRef(transcript)
  transcriptRef.current = transcript
  const [answers, setAnswers] = useState<Answer[]>([])
  const answersRef = useRef(answers)
  answersRef.current = answers
  const [index, setIndex] = useState(-1)
  const [listening, setListening] = useState(false)
  const [sttMode, setSttMode] = useState<'live' | 'mock' | null>(null)
  const [channelStatus, setChannelStatus] = useState<Partial<Record<AudioChannel, SttStatus>>>({})
  const [levels, setLevels] = useState<Record<AudioChannel, number>>({ system: 0, mic: 0 })
  const [audioErrors, setAudioErrors] = useState<Partial<Record<AudioChannel, string>>>({})
  const [input, setInput] = useState('')
  const [copied, setCopied] = useState(false)
  const captureRef = useRef<AudioCapture | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const transcriptEnd = useRef<HTMLDivElement>(null)
  const interactiveRef = useRef(false)

  // --- Paso de clics: interactiva solo cuando el mouse está sobre un panel ---------------
  useEffect(() => {
    const setInteractive = (value: boolean): void => {
      if (interactiveRef.current === value) return
      interactiveRef.current = value
      api().setInteractive(value)
    }
    const onMove = (e: MouseEvent): void => {
      mouseMoves++
      const el = e.target as Element | null
      setInteractive(Boolean(el?.closest?.('[data-interactive]')))
    }
    const onLeave = (): void => {
      // Si el input tiene el foco, seguimos interactivos para poder escribir.
      if (document.activeElement !== inputRef.current) setInteractive(false)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)
    window.addEventListener('blur', () => setInteractive(false))
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  // --- Eventos del proceso main ---------------------------------------------------------
  useEffect(() => {
    const offs = [
      api().on('stt:event', (e) => setTranscript((s) => applySttEvent(s, e))),
      api().on('stt:status', (s) => setChannelStatus((prev) => ({ ...prev, [s.channel]: s }))),
      api().on('ai:delta', ({ id, text }) =>
        setAnswers((list) => list.map((a) => (a.id === id ? { ...a, text: a.text + text } : a)))
      ),
      api().on('ai:done', ({ id, error, mode }) =>
        setAnswers((list) =>
          list.map((a) => (a.id === id ? { ...a, status: error ? 'error' : 'done', error, mode } : a))
        )
      )
    ]
    return () => offs.forEach((off) => off())
  }, [])

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: 'end' })
  }, [transcript])

  // --- Acciones ---------------------------------------------------------------------------
  const run = useCallback(
    (action: AiAction, extra: { userMessage?: string; sourceText?: string; targetLanguage?: 'en' | 'es' } = {}) => {
      const state = transcriptRef.current
      const lastQuestion = lastInterviewerTurn(state)
      const id = newId()
      const label =
        action === 'help'
          ? lastQuestion || t('answers.kind.help')
          : action === 'direct'
            ? extra.userMessage ?? ''
            : action === 'screen'
              ? t('answers.kind.screen')
              : t('answers.kind.translate')
      setAnswers((list) => {
        const next = [...list, { id, action, label, text: '', status: 'streaming' as const }]
        setIndex(next.length - 1)
        return next
      })
      void api().runAi({
        id,
        action,
        transcript: formatTranscriptForPrompt(state),
        lastQuestion,
        ...extra
      })
    },
    [t]
  )

  const help = useCallback(() => run('help'), [run])
  const screen = useCallback(() => run('screen'), [run])
  const sendDirect = useCallback(() => {
    const text = input.trim()
    if (!text) return
    setInput('')
    run('direct', { userMessage: text })
  }, [input, run])

  const startListening = useCallback(async () => {
    if (listening) return
    const mode = await api().sttStart()
    setSttMode(mode)
    setListening(true)
    try {
      const capture = await startAudioCapture(
        (channel, pcm) => api().sttAudio(channel, pcm),
        (channel, level) => setLevels((l) => (Math.abs(l[channel] - level) > 0.04 ? { ...l, [channel]: level } : l))
      )
      captureRef.current = capture
      setAudioErrors(capture.errors)
    } catch (err) {
      setAudioErrors({ system: String(err) })
    }
  }, [listening])

  const stopListening = useCallback(() => {
    captureRef.current?.stop()
    captureRef.current = null
    api().sttStop()
    setListening(false)
    setChannelStatus({})
    setLevels({ system: 0, mic: 0 })
  }, [])

  const clearAnswers = useCallback(() => {
    answersRef.current.filter((a) => a.status === 'streaming').forEach((a) => api().cancelAi(a.id))
    setAnswers([])
    setIndex(-1)
  }, [])

  // --- Atajos globales que resuelve el renderer -------------------------------------------
  useEffect(() => {
    return api().on('shortcut', (action) => {
      switch (action) {
        case 'help':
          help()
          break
        case 'screen':
          screen()
          break
        case 'prevAnswer':
          setIndex((i) => Math.max(0, i - 1))
          break
        case 'nextAnswer':
          setIndex((i) => Math.min(answersRef.current.length - 1, i + 1))
          break
        case 'clearTranscript':
          setTranscript((s) => clearTranscript(s))
          break
        case 'clearAnswers':
          clearAnswers()
          break
        case 'focusInput':
          interactiveRef.current = true
          inputRef.current?.focus()
          break
      }
    })
  }, [help, screen, clearAnswers])

  // Ganchos para la autoprueba (npm run selftest).
  useEffect(() => {
    ;(window as unknown as { __chuletaiTest: unknown }).__chuletaiTest = {
      start: startListening,
      stop: stopListening,
      help,
      direct: (text: string) => run('direct', { userMessage: text }),
      state: () => ({
        listening,
        sttMode,
        segments: transcriptRef.current.segments,
        answers: answersRef.current,
        audioErrors,
        selection: window.getSelection()?.toString() ?? '',
        mouseMoves,
        text: document.body.innerText
      })
    }
  }, [startListening, stopListening, help, run, listening, sttMode, audioErrors])

  if (!settings || !status) return null

  const mod = settings.shortcutModifier
  const current = index >= 0 ? answers[index] : undefined
  const segments = visibleSegments(transcript)
  const simulated = status.aiMode === 'mock' || status.sttMode === 'mock'
  const setLanguage = (interviewLanguage: InterviewLanguage): void => void update({ interviewLanguage })
  const otherLang = current ? (guessLanguage(current.text) === 'es' ? 'en' : 'es') : 'en'

  return (
    <div className="overlay" style={{ opacity: settings.opacity }}>
      {/* Barra superior */}
      <header className="card bar" data-interactive>
        <div
          className="drag"
          title="ChuletAI"
          onMouseDown={(e) => {
            let lastX = e.screenX
            let lastY = e.screenY
            const move = (ev: MouseEvent): void => {
              api().moveBy(ev.screenX - lastX, ev.screenY - lastY)
              lastX = ev.screenX
              lastY = ev.screenY
            }
            const up = (): void => {
              window.removeEventListener('mousemove', move)
              window.removeEventListener('mouseup', up)
            }
            window.addEventListener('mousemove', move)
            window.addEventListener('mouseup', up)
          }}
        >
          <span className="logo" aria-hidden>
            ◆
          </span>
          <strong>ChuletAI</strong>
        </div>

        <button
          className={`btn ${listening ? 'danger' : 'primary'}`}
          onClick={() => (listening ? stopListening() : void startListening())}
        >
          {listening ? t('session.stop') : t('session.start')}
        </button>

        <div className="seg" role="group" aria-label={t('session.language')} title={t('session.language')}>
          {(['en', 'es', 'auto'] as const).map((l) => (
            <button
              key={l}
              className={settings.interviewLanguage === l ? 'on' : ''}
              onClick={() => setLanguage(l)}
              title={t(`lang.${l}`)}
            >
              {t(`lang.short.${l}`)}
            </button>
          ))}
        </div>

        <span className="spacer" />
        {simulated && (
          <span className="badge warn" title={t('app.simulatedHint')}>
            {t('app.simulated')}
          </span>
        )}
        <button
          className={`badge ${settings.privateMode ? 'ok' : 'off'}`}
          title={settings.privateMode ? t('app.privateOn') : t('app.privateOff')}
          onClick={() => void update({ privateMode: !settings.privateMode })}
        >
          {settings.privateMode ? '● ' : '○ '}
          {t('app.private')}
        </button>
        <button className="icon" title={t('toolbar.settings')} onClick={() => api().openSettings()}>
          ⚙
        </button>
        <button className="icon" title={t('toolbar.hide', { key: shortcutLabel('toggleVisibility', mod) })} onClick={() => api().hide()}>
          –
        </button>
      </header>

      {/* Transcripción */}
      <section className={`card transcript ${settings.showTranscript ? '' : 'collapsed'}`} data-interactive>
        <div className="card-head">
          <span>{t('transcript.title')}</span>
          <span className="meters">
            {(['system', 'mic'] as const).map((c) => (
              <span
                key={c}
                className={`meter ${channelStatus[c]?.state ?? 'idle'} ${audioErrors[c] ? 'error' : ''}`}
                title={`${t(`channel.${c}`)}${audioErrors[c] ? ` — ${t('error.audio', { message: audioErrors[c] ?? '' })}` : ''}${channelStatus[c]?.message ? ` — ${channelStatus[c]?.message}` : ''}`}
              >
                {c === 'system' ? '🔊' : '🎙'}
                <i style={{ width: `${Math.round(levels[c] * 100)}%` }} />
              </span>
            ))}
          </span>
          <span className="spacer" />
          <button className="icon" title={t('transcript.clear')} onClick={() => setTranscript((s) => clearTranscript(s))}>
            ⌫
          </button>
          <button
            className="icon"
            title={settings.showTranscript ? t('transcript.collapse') : t('transcript.expand')}
            onClick={() => void update({ showTranscript: !settings.showTranscript })}
          >
            {settings.showTranscript ? '▾' : '▸'}
          </button>
        </div>
        {settings.showTranscript && (
          <div className="transcript-body">
            {segments.length === 0 ? (
              <p className="muted">{listening ? t('session.listening') + '…' : t('transcript.empty')}</p>
            ) : (
              segments.map((s) => (
                <p key={s.id} className={`line ${s.speaker} ${s.final ? '' : 'interim'}`}>
                  <b>{t(`speaker.${s.speaker}`)}</b> {s.text}
                </p>
              ))
            )}
            <div ref={transcriptEnd} />
          </div>
        )}
      </section>

      {/* Acciones */}
      <section className="card actions" data-interactive>
        <button className="btn primary big" onClick={help} title={shortcutLabel('help', mod)}>
          {t('action.help')} <kbd>{shortcutLabel('help', mod)}</kbd>
        </button>
        <button className="btn" onClick={screen} title={shortcutLabel('screen', mod)}>
          {t('action.screen')}
        </button>
        <form
          className="ask"
          onSubmit={(e) => {
            e.preventDefault()
            sendDirect()
          }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('action.directPlaceholder')}
            onBlur={() => {
              interactiveRef.current = false
              api().setInteractive(false)
            }}
          />
          <button className="btn" type="submit" disabled={!input.trim()}>
            {t('action.direct')}
          </button>
        </form>
      </section>

      {/* Respuestas */}
      <section className="card answers" data-interactive>
        <div className="card-head">
          <span>{t('answers.title')}</span>
          {answers.length > 0 && (
            <span className="nav">
              <button
                className="icon"
                disabled={index <= 0}
                title={`${t('answers.prev')} (${shortcutLabel('prevAnswer', mod)})`}
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
              >
                ‹
              </button>
              <span className="count">
                {index + 1}/{answers.length}
              </span>
              <button
                className="icon"
                disabled={index >= answers.length - 1}
                title={`${t('answers.next')} (${shortcutLabel('nextAnswer', mod)})`}
                onClick={() => setIndex((i) => Math.min(answers.length - 1, i + 1))}
              >
                ›
              </button>
            </span>
          )}
          <span className="spacer" />
          {current?.status === 'streaming' && (
            <button className="btn small" onClick={() => api().cancelAi(current.id)}>
              {t('action.stop')}
            </button>
          )}
          {current?.status === 'done' && current.text && (
            <>
              <button
                className="btn small"
                onClick={() => run('translate', { sourceText: current.text, targetLanguage: otherLang })}
              >
                {t('action.translate', { lang: t(`lang.short.${otherLang}`) })}
              </button>
              <button
                className="btn small"
                onClick={() => {
                  api().copyText(current.text)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1200)
                }}
              >
                {copied ? t('action.copied') : t('action.copy')}
              </button>
            </>
          )}
          {answers.length > 0 && (
            <button className="icon" title={t('answers.clear')} onClick={clearAnswers}>
              🗑
            </button>
          )}
        </div>
        <div className="answer-body">
          {!current ? (
            <p className="muted">{t('answers.empty', { key: shortcutLabel('help', mod) })}</p>
          ) : (
            <>
              {current.label && (
                <p className="question">
                  <span className="tag">{t(`answers.kind.${current.action}`)}</span> {current.label}
                </p>
              )}
              {current.text ? (
                <div className="md">
                  <Markdown remarkPlugins={[remarkGfm]}>{current.text}</Markdown>
                </div>
              ) : current.status === 'streaming' ? (
                <p className="muted pulse">{t('answers.thinking')}</p>
              ) : null}
              {current.status === 'error' && <p className="error">{t('answers.error', { message: current.error ?? '' })}</p>}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
