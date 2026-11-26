import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  session,
  Tray
} from 'electron'
import { join } from 'node:path'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { createTranslator, resolveUiLanguage } from '../shared/i18n'
import { buildSystemPrompt, buildUserPrompt, effortForAction, expectedAnswerLanguage } from '../shared/prompt'
import { allAccelerators } from '../shared/shortcuts'
import type {
  AiRunRequest,
  AudioChannel,
  KeyName,
  RuntimeStatus,
  Settings,
  ShortcutAction,
  SttEvent,
  SttStatus
} from '../shared/types'
import { AnthropicProvider, describeAnthropicError } from './ai/anthropic'
import { GeminiProvider } from './ai/gemini'
import { MockProvider } from './ai/mock'
import { AiRefusalError, type AiProvider } from './ai/provider'
import { captureScreen, createOverlayWindow, loadRenderer, moveWindowBy, setInteractive } from './overlay'
import { loadTemplates } from './prompts'
import { readResumeFile } from './resume'
import { DeepgramChannel } from './stt/deepgram'
import { MockStt } from './stt/mock'
import { log } from './log'
import { KeyStore, SettingsStore } from './store'

const SELFTEST = process.argv.includes('--selftest')
if (SELFTEST) {
  // La autoprueba usa su propio perfil para no tocar los ajustes reales.
  app.setPath('userData', join(app.getPath('temp'), `chuletai-selftest-${process.pid}`))
  if (process.argv.includes('--live')) {
    // Prueba en vivo: usa las claves reales (keys.json + la clave de cifrado en "Local State").
    const real = join(app.getPath('appData'), 'chuletai')
    mkdirSync(app.getPath('userData'), { recursive: true })
    for (const f of ['Local State', 'keys.json']) {
      if (existsSync(join(real, f))) copyFileSync(join(real, f), join(app.getPath('userData'), f))
    }
  }
}

export interface AppContext {
  overlay: BrowserWindow | null
  settingsWin: BrowserWindow | null
  tray: Tray | null
  settings: SettingsStore
  keys: KeyStore
  shortcutLog: ShortcutAction[]
}

export const ctx: AppContext = {
  overlay: null,
  settingsWin: null,
  tray: null,
  settings: null as unknown as SettingsStore,
  keys: null as unknown as KeyStore,
  shortcutLog: []
}

const MOVE_STEP = 40

// ---------------------------------------------------------------------------
// Estado de ejecución

function runtimeStatus(): RuntimeStatus {
  const s = ctx.settings.get()
  const keys = ctx.keys.status()
  const aiKey: KeyName = s.aiProvider === 'gemini' ? 'gemini' : 'anthropic'
  return {
    aiMode: !s.simulation && keys[aiKey] ? 'live' : 'mock',
    sttMode: !s.simulation && keys.deepgram ? 'live' : 'mock',
    keys,
    keyHints: ctx.keys.hints(),
    encryptionAvailable: ctx.keys.encryptionAvailable(),
    systemLocale: app.getLocale()
  }
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

function sendToOverlay(channel: string, payload: unknown): void {
  const win = ctx.overlay
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

// ---------------------------------------------------------------------------
// Ventanas y bandeja

function iconPath(): string {
  const packaged = join(process.resourcesPath, 'icon.png')
  if (app.isPackaged && existsSync(packaged)) return packaged
  return join(__dirname, '../../resources/icon.png')
}

function createOverlay(): void {
  const win = createOverlayWindow(ctx.settings.get().privateMode)
  ctx.overlay = win
  void loadRenderer(win, 'overlay')
  win.on('closed', () => (ctx.overlay = null))
}

function openSettings(): void {
  if (ctx.settingsWin && !ctx.settingsWin.isDestroyed()) {
    ctx.settingsWin.show()
    ctx.settingsWin.focus()
    return
  }
  const t = createTranslator(resolveUiLanguage(ctx.settings.get().uiLanguage, app.getLocale()))
  const win = new BrowserWindow({
    width: 820,
    height: 700,
    minWidth: 640,
    minHeight: 520,
    title: t('settings.title'),
    icon: iconPath(),
    autoHideMenuBar: true,
    backgroundColor: '#111418',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.setContentProtection(ctx.settings.get().privateMode)
  ctx.settingsWin = win
  void loadRenderer(win, 'settings')
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => (ctx.settingsWin = null))
}

function toggleOverlay(): void {
  const win = ctx.overlay
  if (!win) return
  if (win.isVisible()) {
    setInteractive(win, false)
    win.hide()
  } else {
    win.showInactive()
    win.setAlwaysOnTop(true, 'screen-saver')
  }
}

function buildTray(): void {
  const t = createTranslator(resolveUiLanguage(ctx.settings.get().uiLanguage, app.getLocale()))
  if (!ctx.tray) {
    const image = nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 })
    ctx.tray = new Tray(image)
    ctx.tray.setToolTip('ChuletAI')
    ctx.tray.on('click', toggleOverlay)
  }
  ctx.tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t('tray.show'), click: toggleOverlay },
      { label: t('tray.settings'), click: openSettings },
      { type: 'separator' },
      { label: t('tray.quit'), click: () => app.quit() }
    ])
  )
}

// ---------------------------------------------------------------------------
// Atajos globales

function handleShortcut(action: ShortcutAction): void {
  ctx.shortcutLog.push(action)
  const win = ctx.overlay
  if (!win) return
  switch (action) {
    case 'toggleVisibility':
      toggleOverlay()
      return
    case 'moveUp':
      moveWindowBy(win, 0, -MOVE_STEP)
      return
    case 'moveDown':
      moveWindowBy(win, 0, MOVE_STEP)
      return
    case 'moveLeft':
      moveWindowBy(win, -MOVE_STEP, 0)
      return
    case 'moveRight':
      moveWindowBy(win, MOVE_STEP, 0)
      return
    case 'focusInput':
      if (!win.isVisible()) win.showInactive()
      setInteractive(win, true)
      win.focus()
      sendToOverlay('shortcut', action)
      return
    default:
      // help, screen, prevAnswer, nextAnswer, clearTranscript, clearAnswers: los resuelve el renderer.
      if ((action === 'help' || action === 'screen') && !win.isVisible()) win.showInactive()
      sendToOverlay('shortcut', action)
  }
}

export function registerShortcuts(): { failed: string[] } {
  globalShortcut.unregisterAll()
  const failed: string[] = []
  for (const { action, accelerator } of allAccelerators(ctx.settings.get().shortcutModifier)) {
    const ok = globalShortcut.register(accelerator, () => handleShortcut(action))
    if (!ok) failed.push(accelerator)
  }
  if (failed.length) console.warn('[shortcuts] could not register:', failed.join(', '))
  return { failed }
}

// ---------------------------------------------------------------------------
// Transcripción

interface SttSession {
  send(channel: AudioChannel, pcm: Buffer): void
  stop(): void
}

let stt: SttSession | null = null

function startStt(): 'live' | 'mock' {
  stopStt()
  const settings = ctx.settings.get()
  const status = runtimeStatus()
  log('stt', `start mode=${status.sttMode} language=${settings.interviewLanguage}`)
  const onEvent = (e: SttEvent): void => sendToOverlay('stt:event', e)
  const onStatus = (s: SttStatus): void => sendToOverlay('stt:status', s)
  if (status.sttMode === 'mock') {
    const mock = new MockStt(settings.interviewLanguage, onEvent, onStatus)
    stt = { send: () => mock.send(), stop: () => mock.stop() }
    return 'mock'
  }
  const key = ctx.keys.get('deepgram') as string
  const channels: Record<AudioChannel, DeepgramChannel> = {
    system: new DeepgramChannel('system', key, settings.interviewLanguage, onEvent, onStatus),
    mic: new DeepgramChannel('mic', key, settings.interviewLanguage, onEvent, onStatus)
  }
  stt = {
    send: (channel, pcm) => channels[channel].send(pcm),
    stop: () => {
      channels.system.stop()
      channels.mic.stop()
    }
  }
  return 'live'
}

function stopStt(): void {
  stt?.stop()
  stt = null
}

// ---------------------------------------------------------------------------
// IA

const running = new Map<string, AbortController>()

function providerFor(req: AiRunRequest, settings: Settings): { provider: AiProvider; mode: 'live' | 'mock' } {
  const status = runtimeStatus()
  if (status.aiMode === 'mock') return { provider: new MockProvider(req.action), mode: 'mock' }
  // Se reutiliza el cliente (y su conexión TLS abierta) mientras no cambien la clave ni el modelo.
  const key = settings.aiProvider === 'gemini' ? (ctx.keys.get('gemini') as string) : (ctx.keys.get('anthropic') as string)
  const model = settings.aiProvider === 'gemini' ? settings.geminiModel : settings.anthropicModel
  const cacheKey = `${settings.aiProvider}|${model}|${key}`
  if (!cachedProvider || cachedProvider.key !== cacheKey) {
    cachedProvider = {
      key: cacheKey,
      provider: settings.aiProvider === 'gemini' ? new GeminiProvider(key, model) : new AnthropicProvider(key, model)
    }
  }
  return { provider: cachedProvider.provider, mode: 'live' }
}

let cachedProvider: { key: string; provider: AiProvider } | null = null

async function runAi(req: AiRunRequest): Promise<void> {
  const settings = ctx.settings.get()
  const controller = new AbortController()
  running.set(req.id, controller)
  const { provider, mode } = providerFor(req, settings)
  try {
    const templates = loadTemplates()
    const system = buildSystemPrompt(templates, {
      context: settings.context,
      interviewLanguage: settings.interviewLanguage,
      answerLength: settings.answerLength
    })
    const user = buildUserPrompt(templates, req)
    const image =
      req.action === 'screen' && ctx.overlay ? await captureScreen(ctx.overlay, settings.privateMode) : undefined
    await provider.stream({
      system,
      user,
      image,
      effort: effortForAction(req.action, settings.effort),
      language: expectedAnswerLanguage(settings.interviewLanguage, req),
      signal: controller.signal,
      onText: (text) => sendToOverlay('ai:delta', { id: req.id, text })
    })
    sendToOverlay('ai:done', { id: req.id, mode })
  } catch (err) {
    if (controller.signal.aborted) {
      sendToOverlay('ai:done', { id: req.id, mode })
    } else {
      const message =
        err instanceof AiRefusalError
          ? err.message
          : provider.id === 'anthropic'
            ? describeAnthropicError(err)
            : err instanceof Error
              ? err.message
              : String(err)
      log('ai', `${req.action} failed: ${message}`)
      sendToOverlay('ai:done', { id: req.id, mode, error: message })
    }
  } finally {
    running.delete(req.id)
  }
}

// ---------------------------------------------------------------------------
// Ajustes

function applySettings(prev: Settings, next: Settings): void {
  if (prev.privateMode !== next.privateMode) {
    ctx.overlay?.setContentProtection(next.privateMode)
    ctx.settingsWin?.setContentProtection(next.privateMode)
  }
  if (prev.shortcutModifier !== next.shortcutModifier) registerShortcuts()
  if (prev.uiLanguage !== next.uiLanguage) {
    buildTray()
    const t = createTranslator(resolveUiLanguage(next.uiLanguage, app.getLocale()))
    ctx.settingsWin?.setTitle(t('settings.title'))
  }
  // Cambiar el idioma de la entrevista reinicia la transcripción con el nuevo idioma.
  if (stt && prev.interviewLanguage !== next.interviewLanguage) startStt()
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => ctx.settings.get())
  ipcMain.handle('settings:update', (_e, patch: Partial<Settings>) => {
    const prev = ctx.settings.get()
    const next = ctx.settings.update(patch)
    applySettings(prev, next)
    broadcast('settings:changed', next)
    broadcast('status:changed', runtimeStatus())
    return next
  })
  ipcMain.handle('status:get', () => runtimeStatus())
  ipcMain.handle('keys:set', async (_e, name: KeyName, value: string) => {
    try {
      await ctx.keys.set(name, value)
      log('keys', `${name}: ${value.trim() ? 'saved' : 'removed'}`)
    } catch (err) {
      log('keys', `${name}: save FAILED ${err instanceof Error ? err.message : String(err)}`)
      throw err
    }
    const status = runtimeStatus()
    broadcast('status:changed', status)
    return status
  })
  ipcMain.handle('resume:pick', async (e) => {
    const parent = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const opts: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      filters: [{ name: 'CV', extensions: ['pdf', 'txt', 'md'] }]
    }
    const res = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return null
    try {
      return await readResumeFile(res.filePaths[0])
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })
  ipcMain.handle('ai:run', (_e, req: AiRunRequest) => runAi(req))
  ipcMain.on('ai:cancel', (_e, id: string) => running.get(id)?.abort())
  ipcMain.handle('stt:start', () => startStt())
  ipcMain.on('stt:audio', (_e, channel: AudioChannel, chunk: ArrayBuffer) => stt?.send(channel, Buffer.from(chunk)))
  ipcMain.on('stt:stop', () => stopStt())
  ipcMain.on('overlay:interactive', (_e, interactive: boolean) => ctx.overlay && setInteractive(ctx.overlay, interactive))
  ipcMain.on('overlay:moveBy', (_e, dx: number, dy: number) => ctx.overlay && moveWindowBy(ctx.overlay, dx, dy))
  ipcMain.on('overlay:hide', () => ctx.overlay?.isVisible() && toggleOverlay())
  ipcMain.on('settings:open', () => openSettings())
  ipcMain.on('app:quit', () => app.quit())
  ipcMain.on('clipboard:write', (_e, text: string) => clipboard.writeText(String(text)))
  ipcMain.on('log', (_e, scope: string, message: string) => log(`ui:${String(scope).slice(0, 20)}`, String(message).slice(0, 500)))
}

/** Audio del sistema por loopback: getDisplayMedia en el renderer recibe la pantalla + 'loopback'. */
function registerMediaHandlers(): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => callback({ video: sources[0], audio: 'loopback' }))
        .catch(() => callback({}))
    },
    { useSystemPicker: false }
  )
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['media', 'display-capture', 'clipboard-sanitized-write'].includes(permission))
  })
}

// ---------------------------------------------------------------------------
// Arranque

if (!SELFTEST && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => ctx.overlay?.showInactive())

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.chuletai.app')
    log('app', `start v${app.getVersion()} packaged=${app.isPackaged}`)
    ctx.settings = new SettingsStore()
    ctx.keys = new KeyStore()
    await ctx.keys.init()
    log('keys', `loaded: ${JSON.stringify(ctx.keys.status())} encryption=${ctx.keys.encryptionAvailable()}`)
    // En desarrollo se aceptan claves por variable de entorno (solo en memoria, nunca se guardan).
    if (!app.isPackaged && !SELFTEST) {
      ctx.keys.setInMemory('anthropic', process.env.ANTHROPIC_API_KEY)
      ctx.keys.setInMemory('gemini', process.env.GEMINI_API_KEY)
      ctx.keys.setInMemory('deepgram', process.env.DEEPGRAM_API_KEY)
    }
    registerMediaHandlers()
    registerIpc()
    createOverlay()
    buildTray()
    registerShortcuts()

    if (SELFTEST) {
      const { runSelftest, runLiveTest } = await import('./selftest')
      if (process.argv.includes('--live')) await runLiveTest(ctx, { registerShortcuts, runtimeStatus, toggleOverlay, openSettings })
      else await runSelftest(ctx, { registerShortcuts, runtimeStatus, toggleOverlay, openSettings })
    }
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    stopStt()
  })
  app.on('window-all-closed', () => {
    // La app vive en la bandeja; solo se cierra con "Salir".
  })
}
