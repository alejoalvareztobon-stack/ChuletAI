// Autoprueba de la app real (npm run selftest). Abre la ventana flotante con un perfil
// temporal y en modo simulado, y comprueba con Win32 y desktopCapturer:
//  - estilos de la ventana (siempre encima, transparente a clics, sin barra de tareas)
//  - que el paso de clics se desactiva al pasar el mouse por un panel
//  - modo privado: afinidad WDA_EXCLUDEFROMCAPTURE y que no aparece en una captura
//  - cambio de idioma de la interfaz
//  - atajos globales (pulsaciones de teclado reales con keybd_event)
//  - flujo completo simulado: transcripción -> Ayúdame -> respuesta, en inglés y español
// Guarda capturas y un report.json en ./selftest-output y sale con código 0 si todo pasó.

import { app, desktopCapturer, globalShortcut, screen, type BrowserWindow, type NativeImage } from 'electron'
import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { allAccelerators } from '../shared/shortcuts'
import type { RuntimeStatus } from '../shared/types'
import type { AppContext } from './index'
import { KeyStore } from './store'

interface Helpers {
  registerShortcuts: () => { failed: string[] }
  runtimeStatus: () => RuntimeStatus
  toggleOverlay: () => void
  openSettings: () => void
}

interface Check {
  name: string
  ok: boolean
  detail?: string
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function waitFor<T>(fn: () => T | Promise<T>, timeoutMs: number, intervalMs = 150): Promise<T | undefined> {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const v = await fn()
    if (v) return v
    await sleep(intervalMs)
  }
  return undefined
}

const WIN32 = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class W32 {
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool GetWindowDisplayAffinity(IntPtr h, out uint a);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
}
"@
`

function powershell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WIN32 + script],
      { timeout: 30_000, windowsHide: true },
      (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout.trim()))
    )
  })
}

function hwndOf(win: BrowserWindow): string {
  return win.getNativeWindowHandle().readBigUInt64LE(0).toString()
}

async function windowInfo(win: BrowserWindow): Promise<{ exStyle: number; affinity: number }> {
  const out = await powershell(`
$h = [IntPtr]::new([Int64]${hwndOf(win)})
$ex = [W32]::GetWindowLongPtr($h, -20).ToInt64()
$a = 0; [void][W32]::GetWindowDisplayAffinity($h, [ref]$a)
Write-Output "$ex $a"`)
  const [ex, aff] = out.split(/\s+/).map(Number)
  return { exStyle: ex, affinity: aff }
}

const VK: Record<string, number> = {
  Control: 0x11,
  Shift: 0x10,
  Alt: 0x12,
  Enter: 0x0d,
  H: 0x48,
  Left: 0x25,
  Up: 0x26,
  Right: 0x27,
  Down: 0x28,
  Backspace: 0x08,
  Space: 0x20
}
const EXTENDED = new Set([0x25, 0x26, 0x27, 0x28])

/** Pulsa un acelerador de Electron ("Control+Shift+Enter") con keybd_event. */
async function pressAccelerator(accelerator: string): Promise<void> {
  const keys = accelerator.split('+').map((k) => VK[k])
  const down = keys.map((k) => `[W32]::keybd_event(${k},0,${EXTENDED.has(k) ? 1 : 0},[UIntPtr]::Zero)`)
  const up = keys
    .slice()
    .reverse()
    .map((k) => `[W32]::keybd_event(${k},0,${(EXTENDED.has(k) ? 1 : 0) | 2},[UIntPtr]::Zero)`)
  await powershell(`${down.join('; ')}; Start-Sleep -Milliseconds 60; ${up.join('; ')}`)
}

/** Mueve el puntero real a un punto en DIP (entrada inyectada, la ven los hooks de bajo nivel). */
async function moveMouse(x: number, y: number): Promise<void> {
  // MOUSEEVENTF_MOVE|ABSOLUTE|VIRTUALDESK: coordenadas normalizadas 0..65535 sobre el escritorio virtual.
  const all = screen.getAllDisplays().map((d) => d.bounds)
  const vx = Math.min(...all.map((b) => b.x))
  const vy = Math.min(...all.map((b) => b.y))
  const vw = Math.max(...all.map((b) => b.x + b.width)) - vx
  const vh = Math.max(...all.map((b) => b.y + b.height)) - vy
  const nx = Math.round(((x - vx) * 65535) / (vw - 1))
  const ny = Math.round(((y - vy) * 65535) / (vh - 1))
  await powershell(`[W32]::mouse_event(0xC001,${nx},${ny},0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 80; [W32]::mouse_event(0xC001,${nx + 200},${ny + 100},0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 80; [W32]::mouse_event(0xC001,${nx},${ny},0,[UIntPtr]::Zero)`)
}

async function captureWindowRegion(win: BrowserWindow): Promise<NativeImage> {
  const b = win.getBounds()
  const display = screen.getDisplayMatching(b)
  const sf = display.scaleFactor
  const size = { width: display.size.width * sf, height: display.size.height * sf }
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size })
  const src = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  const img = src.thumbnail
  const scale = img.getSize().width / display.size.width
  return img.crop({
    x: Math.round((b.x - display.bounds.x) * scale),
    y: Math.round((b.y - display.bounds.y) * scale),
    width: Math.round(b.width * scale),
    height: Math.round(b.height * scale)
  })
}

/** Cuenta píxeles del verde de acento de ChuletAI (#2fd3a6). toBitmap() es BGRA en Windows. */
function accentPixels(img: NativeImage): number {
  const bmp = img.toBitmap()
  let n = 0
  for (let i = 0; i < bmp.length; i += 4) {
    if (Math.abs(bmp[i] - 166) < 24 && Math.abs(bmp[i + 1] - 211) < 24 && Math.abs(bmp[i + 2] - 47) < 24) n++
  }
  return n
}

export async function runSelftest(ctx: AppContext, helpers: Helpers): Promise<void> {
  // En la app empaquetada getAppPath() está dentro del asar: la salida va a la carpeta temporal.
  const outDir = app.isPackaged ? join(app.getPath('temp'), 'chuletai-selftest-output') : join(app.getAppPath(), 'selftest-output')
  mkdirSync(outDir, { recursive: true })
  const checks: Check[] = []
  const check = (name: string, ok: boolean, detail?: string): void => {
    checks.push({ name, ok, detail })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  }
  const js = <T>(code: string): Promise<T> => ctx.overlay!.webContents.executeJavaScript(code, true) as Promise<T>
  const state = (): Promise<{
    listening: boolean
    sttMode: string | null
    segments: Array<{ speaker: string; text: string }>
    answers: Array<{ action: string; text: string; status: string; error?: string; mode?: string }>
    audioErrors: Record<string, string>
    selection: string
    text: string
  }> => js('window.__chuletaiTest.state()')

  try {
    ctx.settings.update({ simulation: true, privateMode: false, uiLanguage: 'es', interviewLanguage: 'en' })
    const win = ctx.overlay!
    await waitFor(() => win.isVisible(), 15_000)
    await waitFor(() => js<boolean>('Boolean(window.__chuletaiTest)').catch(() => false), 15_000)
    await sleep(800)

    // --- Ventana ---------------------------------------------------------------------------
    check('ventana visible', win.isVisible())
    check('siempre encima', win.isAlwaysOnTop())
    const info = await windowInfo(win)
    const WS_EX_TOPMOST = 0x8
    const WS_EX_TRANSPARENT = 0x20
    const WS_EX_TOOLWINDOW = 0x80
    const WS_EX_LAYERED = 0x80000
    check('WS_EX_TOPMOST', (info.exStyle & WS_EX_TOPMOST) !== 0, `exStyle=0x${info.exStyle.toString(16)}`)
    check('WS_EX_TOOLWINDOW (sin barra de tareas ni Alt+Tab, en todos los escritorios)', (info.exStyle & WS_EX_TOOLWINDOW) !== 0)
    check('WS_EX_LAYERED (transparente)', (info.exStyle & WS_EX_LAYERED) !== 0)
    check('paso de clics activo (WS_EX_TRANSPARENT)', (info.exStyle & WS_EX_TRANSPARENT) !== 0)
    console.log('selección inicial:', JSON.stringify((await state()).selection))
    const page = await win.webContents.capturePage()
    writeFileSync(join(outDir, '01-overlay-es.png'), page.toPNG())

    // --- Paso de clics al pasar el mouse -----------------------------------------------------
    const b = win.getBounds()
    const original = screen.getCursorScreenPoint()
    const sf = screen.getDisplayMatching(b).scaleFactor
    // Centro de la barra superior (un panel interactivo), en píxeles físicos.
    await moveMouse(b.x + b.width / 2, b.y + 22)
    const becameInteractive = await waitFor(async () => ((await windowInfo(win)).exStyle & WS_EX_TRANSPARENT) === 0, 4000, 300)
    check('al pasar el mouse por un panel la ventana recibe clics', Boolean(becameInteractive), `mousemoves=${(await js<{ mouseMoves: number }>('window.__chuletaiTest.state()')).mouseMoves} cursor=${JSON.stringify(screen.getCursorScreenPoint())} bounds=${JSON.stringify(b)} sf=${sf}`)
    // Fuera de la ventana: vuelve a dejar pasar los clics.
    await moveMouse(b.x - 200, b.y + b.height / 2)
    const backToClickThrough = await waitFor(async () => ((await windowInfo(win)).exStyle & WS_EX_TRANSPARENT) !== 0, 4000, 300)
    check('al salir vuelve el paso de clics', Boolean(backToClickThrough))
    await moveMouse(original.x, original.y)

    // --- Modo privado ------------------------------------------------------------------------
    win.setContentProtection(false)
    await sleep(400)
    const visibleShot = await captureWindowRegion(win)
    writeFileSync(join(outDir, '02-capture-private-off.png'), visibleShot.toPNG())
    check('modo privado apagado: afinidad 0', (await windowInfo(win)).affinity === 0)

    ctx.settings.update({ privateMode: true })
    win.setContentProtection(true)
    await sleep(400)
    const hiddenShot = await captureWindowRegion(win)
    writeFileSync(join(outDir, '03-capture-private-on.png'), hiddenShot.toPNG())
    const aff = (await windowInfo(win)).affinity
    check('modo privado: WDA_EXCLUDEFROMCAPTURE (0x11)', aff === 0x11, `affinity=0x${aff.toString(16)}`)
    // Los botones verdes de la ventana deben verse en la captura normal y no en la privada.
    const greenVisible = accentPixels(visibleShot)
    const greenPrivate = accentPixels(hiddenShot)
    check(
      'modo privado: la ventana no aparece en la captura de desktopCapturer',
      greenVisible > 2000 && greenPrivate < greenVisible / 50,
      `píxeles de acento: normal=${greenVisible} privado=${greenPrivate}`
    )

    // --- Idioma de la interfaz ---------------------------------------------------------------
    const textEs = (await state()).text
    check('interfaz en español', textEs.includes('Ayúdame') && textEs.toLowerCase().includes('transcripción'))
    ctx.settings.update({ uiLanguage: 'en' })
    win.webContents.send('settings:changed', ctx.settings.get())
    const enOk = await waitFor(async () => (await state()).text.includes('Help me'), 3000)
    check('cambio de idioma de la interfaz a inglés', Boolean(enOk))
    writeFileSync(join(outDir, '05-overlay-en.png'), (await win.webContents.capturePage()).toPNG())

    // --- Claves cifradas con safeStorage -----------------------------------------------------
    const fake = 'sk-fake-selftest-1234567890'
    await ctx.keys.set('gemini', fake)
    const onDisk = readFileSync(join(app.getPath('userData'), 'keys.json'), 'utf8')
    check('las claves se guardan cifradas (sin texto plano en keys.json)', ctx.keys.encryptionAvailable() && !onDisk.includes(fake) && onDisk.includes('gemini'))
    const reloaded = new KeyStore()
    await reloaded.init()
    check('las claves se descifran al reiniciar', reloaded.get('gemini') === fake)
    await ctx.keys.set('gemini', '')
    check('quitar una clave la borra del disco', !readFileSync(join(app.getPath('userData'), 'keys.json'), 'utf8').includes('gemini'))

    // --- Atajos globales ---------------------------------------------------------------------
    const accels = allAccelerators(ctx.settings.get().shortcutModifier)
    const unregistered = accels.filter((a) => !globalShortcut.isRegistered(a.accelerator)).map((a) => a.accelerator)
    check('todos los atajos registrados', unregistered.length === 0, unregistered.join(', ') || `${accels.length} atajos`)

    const x0 = win.getBounds().x
    await pressAccelerator('Control+Left')
    const moved = await waitFor(() => win.getBounds().x < x0, 3000)
    check('Ctrl+← mueve la ventana', Boolean(moved), `x ${x0} -> ${win.getBounds().x}`)
    await pressAccelerator('Control+Right')
    await waitFor(() => win.getBounds().x === x0, 3000)

    await pressAccelerator('Control+H')
    const hidden = await waitFor(() => !win.isVisible(), 3000)
    check('Ctrl+H oculta', Boolean(hidden))
    await pressAccelerator('Control+H')
    const shown = await waitFor(() => win.isVisible(), 3000)
    check('Ctrl+H vuelve a mostrar', Boolean(shown))

    // --- Flujo simulado en inglés ------------------------------------------------------------
    await js('window.__chuletaiTest.start()')
    const gotQuestion = await waitFor(
      async () => (await state()).segments.some((s) => s.speaker === 'interviewer'),
      15_000
    )
    check('transcripción simulada (entrevistador)', Boolean(gotQuestion))
    const s1 = await state()
    check('modo de transcripción = simulado', s1.sttMode === 'mock')
    await sleep(1500)
    const status = helpers.runtimeStatus()
    check('estado de ejecución simulado', status.aiMode === 'mock' && status.sttMode === 'mock')

    await pressAccelerator('Control+Enter')
    const answered = await waitFor(async () => {
      const s = await state()
      return s.answers.length > 0 && s.answers[s.answers.length - 1].status === 'done' ? s : undefined
    }, 15_000)
    const lastEn = answered?.answers[answered.answers.length - 1]
    check('Ctrl+Enter -> respuesta en streaming terminada', Boolean(lastEn?.text && lastEn.text.length > 50))
    check('respuesta en inglés', Boolean(lastEn?.text.includes("I'd describe myself")))
    console.log('selección tras el flujo:', JSON.stringify((await state()).selection))
    writeFileSync(join(outDir, '06-flow-en.png'), (await win.webContents.capturePage()).toPNG())

    // Navegación entre respuestas: crea una segunda y vuelve a la primera.
    await js("window.__chuletaiTest.direct('What should I ask at the end?')")
    await waitFor(async () => (await state()).answers.length === 2 && (await state()).answers[1].status === 'done', 10_000)
    await pressAccelerator('Control+Shift+Left')
    const navText = await waitFor(async () => {
      const txt = (await state()).text
      return txt.includes('1/2') ? txt : undefined
    }, 3000)
    check('Ctrl+Shift+← navega a la respuesta anterior', Boolean(navText))

    await pressAccelerator('Control+Shift+Backspace')
    const cleared = await waitFor(async () => (await state()).answers.length === 0, 3000)
    check('Ctrl+Shift+Backspace limpia respuestas', Boolean(cleared))
    // Se detiene la escucha antes: si no, la transcripción simulada sigue llegando.
    await js('window.__chuletaiTest.stop()')
    await sleep(300)
    await pressAccelerator('Control+Backspace')
    const clearedT = await waitFor(async () => (await state()).segments.length === 0, 3000)
    check('Ctrl+Backspace limpia la transcripción', Boolean(clearedT))

    // --- Flujo simulado en español -----------------------------------------------------------
    ctx.settings.update({ interviewLanguage: 'es', uiLanguage: 'es' })
    win.webContents.send('settings:changed', ctx.settings.get())
    await sleep(300)
    await js('window.__chuletaiTest.start()')
    const gotEs = await waitFor(async () => {
      const s = await state()
      return s.segments.find((x) => x.speaker === 'interviewer' && x.text.includes('Hola'))
    }, 15_000)
    check('transcripción simulada en español', Boolean(gotEs))
    await js('window.__chuletaiTest.help()')
    const answeredEs = await waitFor(async () => {
      const s = await state()
      const last = s.answers[s.answers.length - 1]
      return last && last.status === 'done' ? last : undefined
    }, 15_000)
    check('respuesta en español', Boolean(answeredEs?.text.includes('Me describiría')))
    writeFileSync(join(outDir, '07-flow-es.png'), (await win.webContents.capturePage()).toPNG())

    // Traducción de la última respuesta (es -> en).
    await js("window.__chuletaiTest.run('translate', { sourceText: 'Hola', targetLanguage: 'en' })")
    const translated = await waitFor(async () => {
      const s = await state()
      const last = s.answers[s.answers.length - 1]
      return last && last.action === 'translate' && last.status === 'done' ? last : undefined
    }, 15_000)
    check('traducir al otro idioma', Boolean(translated?.text.includes("I'd describe myself")))

    // Analizar pantalla con el atajo (captura real con desktopCapturer + respuesta simulada).
    await pressAccelerator('Control+Shift+Enter')
    const screenAns = await waitFor(async () => {
      const s = await state()
      const last = s.answers[s.answers.length - 1]
      return last && last.action === 'screen' && last.status !== 'streaming' ? last : undefined
    }, 20_000)
    check('Ctrl+Shift+Enter -> analizar pantalla', Boolean(screenAns && screenAns.status === 'done' && screenAns.text.includes('two_sum')), screenAns?.error)

    // Ventana de ajustes.
    helpers.openSettings()
    const sw = await waitFor(() => (ctx.settingsWin && ctx.settingsWin.isVisible() ? ctx.settingsWin : undefined), 10_000)
    await sleep(800)
    if (sw) {
      const settingsText = await sw.webContents.executeJavaScript('document.body.innerText')
      check('ventana de ajustes en español', String(settingsText).includes('Entrevista') && String(settingsText).includes('Hoja de vida'))
      writeFileSync(join(outDir, '08-settings-es.png'), (await sw.webContents.capturePage()).toPNG())

      // Guardar una clave desde la pantalla de Ajustes: Enter (anthropic) y al salir del campo (deepgram).
      const sjs = <T>(code: string): Promise<T> => sw.webContents.executeJavaScript(code, true) as Promise<T>
      const typeKey = (tab: string, key: string, how: 'enter' | 'blur'): Promise<void> =>
        sjs(`(async () => {
          const tabBtn = [...document.querySelectorAll('.tabs button')].find(b => b.textContent.trim() === ${JSON.stringify(tab)})
          tabBtn.click()
          await new Promise(r => setTimeout(r, 300))
          const input = document.querySelector('input[type=password]')
          input.focus()
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(key)})
          input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise(r => setTimeout(r, 100))
          if (${JSON.stringify(how)} === 'enter') input.form.requestSubmit()
          else input.blur()
        })()`)
      await typeKey('IA', 'sk-ant-selftest-0000-ABCD', 'enter')
      const savedEnter = await waitFor(() => ctx.keys.get('anthropic') === 'sk-ant-selftest-0000-ABCD', 4000)
      check('Ajustes: la clave se guarda al pulsar Enter', Boolean(savedEnter))
      const hintShown = await waitFor(async () => String(await sjs('document.body.innerText')).includes('termina en …ABCD'), 3000)
      check('Ajustes: muestra "termina en …ABCD"', Boolean(hintShown))
      await typeKey('Transcripción', 'dg-selftest-1234567-WXYZ', 'blur')
      const savedBlur = await waitFor(() => ctx.keys.get('deepgram') === 'dg-selftest-1234567-WXYZ', 4000)
      check('Ajustes: la clave se guarda al salir del campo', Boolean(savedBlur))
      const reread = new KeyStore()
      await reread.init()
      check('Ajustes: las claves siguen ahí al reiniciar', reread.get('anthropic') === 'sk-ant-selftest-0000-ABCD' && reread.get('deepgram') === 'dg-selftest-1234567-WXYZ')
      writeFileSync(join(outDir, '09-settings-keys.png'), (await sw.webContents.capturePage()).toPNG())
      await ctx.keys.set('anthropic', '')
      await ctx.keys.set('deepgram', '')
      await sjs("document.querySelector('.tabs button:not(.on)') && document.querySelectorAll('.tabs button')[0].click()")
      ctx.settings.update({ uiLanguage: 'en' })
      sw.webContents.send('settings:changed', ctx.settings.get())
      const enSettings = await waitFor(async () => String(await sw.webContents.executeJavaScript('document.body.innerText')).includes('Resume / CV'), 3000)
      check('ventana de ajustes cambia a inglés', Boolean(enSettings))
      sw.close()
    } else {
      check('ventana de ajustes abre', false)
    }

    // El audio debe seguir llegando: compara los bloques recibidos en dos ventanas de 5 s, ~20 s después de empezar.
    type Stats = { system: { chunks: number; ended: number }; mic: { chunks: number; ended: number } }
    const statsNow = async (): Promise<Stats> => (await js<{ audioStats: Stats }>('window.__chuletaiTest.state()')).audioStats
    await sleep(12_000)
    const a1 = await statsNow()
    await sleep(5000)
    const a2 = await statsNow()
    for (const c of ['system', 'mic'] as const) {
      const perSec = (a2[c].chunks - a1[c].chunks) / 5
      check(`el audio de ${c} sigue llegando tras ~20 s`, perSec >= 8, `${perSec.toFixed(1)} bloques/s (esperado ~10), pistas terminadas=${a2[c].ended}`)
    }

    // Audio real: si la captura funciona, el main habrá recibido PCM de ambos canales.
    const s2 = await state()
    check(
      'captura de audio (loopback + micrófono) sin errores',
      Object.keys(s2.audioErrors).length === 0,
      JSON.stringify(s2.audioErrors)
    )
    await js('window.__chuletaiTest.stop()')
  } catch (err) {
    check('autoprueba sin excepciones', false, err instanceof Error ? err.stack : String(err))
  }

  const failed = checks.filter((c) => !c.ok)
  writeFileSync(join(outDir, 'report.json'), JSON.stringify({ date: new Date().toISOString(), checks }, null, 2))
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed. Output: ${outDir}`)
  app.exit(failed.length ? 1 : 0)
}

/**
 * Prueba en vivo (npm run selftest:live): claves reales, Deepgram y Claude de verdad.
 * Inyecta voz sintetizada en inglés como audio del sistema (sin usar los parlantes).
 */
export async function runLiveTest(ctx: AppContext, helpers: Helpers): Promise<void> {
  const outDir = app.isPackaged ? join(app.getPath('temp'), 'chuletai-selftest-output') : join(app.getAppPath(), 'selftest-output')
  mkdirSync(outDir, { recursive: true })
  const checks: Check[] = []
  const check = (name: string, ok: boolean, detail?: string): void => {
    checks.push({ name, ok, detail })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  }
  const js = <T>(code: string): Promise<T> => ctx.overlay!.webContents.executeJavaScript(code, true) as Promise<T>
  type Answer = { action: string; text: string; status: string; error?: string; mode?: string }
  const state = (): Promise<{
    segments: Array<{ speaker: string; text: string }>
    answers: Answer[]
    audioStats: Record<string, { sentBytes: number; recorders: number }>
  }> => js('window.__chuletaiTest.state()')
  const { guessLanguage } = await import('../shared/prompt')

  try {
    ctx.settings.update({
      simulation: false,
      interviewLanguage: 'en',
      uiLanguage: 'es',
      privateMode: true,
      context: {
        company: 'Acme Analytics',
        role: 'Data Analyst',
        jobDescription: 'SQL, Python, Power BI dashboards, stakeholder communication.',
        resume: 'Data analyst at Rappi (2021-2024): automated weekly reporting with Python and SQL, cutting report time from 2 days to 2 hours. Built Power BI dashboards for 5 teams.',
        resumeFileName: 'test.txt',
        notes: ''
      }
    })
    const status = helpers.runtimeStatus()
    check('claves reales cargadas (IA y transcripción en vivo)', status.aiMode === 'live' && status.sttMode === 'live', JSON.stringify(status.keys))
    await waitFor(() => js<boolean>('Boolean(window.__chuletaiTest)').catch(() => false), 15_000)
    ctx.overlay!.webContents.send('settings:changed', ctx.settings.get())

    // Voz sintetizada (Windows SAPI) en inglés.
    const wav = join(app.getPath('temp'), `chuletai-live-${process.pid}.wav`)
    const text =
      'Thanks for joining us today. Can you tell me about your experience with data analysis, and which tools you use every day?'
    await powershell(
      `Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('${wav}'); $s.Speak('${text}'); $s.Dispose()`
    )
    const b64 = readFileSync(wav).toString('base64')

    const t0 = Date.now()
    await js(`window.__chuletaiTest.startWithAudio(${JSON.stringify(b64)})`)
    let firstInterim = 0
    const gotFinal = await waitFor(async () => {
      const s = await state()
      const all = s.segments.filter((x) => x.speaker === 'interviewer').map((x) => x.text).join(' ')
      if (!firstInterim && all) firstInterim = Date.now() - t0
      return /experience/i.test(all) && /tools/i.test(all) ? all : undefined
    }, 120_000, 300)
    const elapsed = Date.now() - t0
    check('Deepgram transcribe la voz en inglés', Boolean(gotFinal), gotFinal ? `"${gotFinal.slice(0, 90)}…" en ${(elapsed / 1000).toFixed(1)} s` : 'sin texto en 120 s')
    const s1 = await state()
    const kbps = (s1.audioStats.system.sentBytes * 8) / 1000 / (elapsed / 1000)
    check('audio enviado comprimido (Opus ~32 kbps)', kbps > 10 && kbps < 60, `${kbps.toFixed(1)} kbps, grabadores=${s1.audioStats.system.recorders}`)

    // Respuesta real de Claude en inglés.
    const ask = async (label: string): Promise<{ a?: Answer; ttft: number; total: number }> => {
      const before = (await state()).answers.length
      const start = Date.now()
      await js('window.__chuletaiTest.help()')
      let ttft = 0
      const a = await waitFor(async () => {
        const s = await state()
        const last = s.answers[before]
        if (last?.text && !ttft) ttft = Date.now() - start
        return last && last.status !== 'streaming' ? last : undefined
      }, 45_000, 100)
      console.log(`--- ${label}:\n${a?.text ?? a?.error ?? '(nada)'}\n---`)
      return { a, ttft, total: Date.now() - start }
    }
    const en = await ask('respuesta EN')
    check('Claude responde (en vivo)', en.a?.status === 'done' && en.a.mode === 'live' && (en.a.text.length ?? 0) > 40, en.a?.error ?? `primer texto en ${(en.ttft / 1000).toFixed(1)} s, total ${(en.total / 1000).toFixed(1)} s`)
    check('respuesta en inglés', guessLanguage(en.a?.text ?? '') === 'en')
    check('usa datos del CV', /rappi|2 hours|two hours|power bi/i.test(en.a?.text ?? ''))
    writeFileSync(join(outDir, 'live-01-en.png'), (await ctx.overlay!.webContents.capturePage()).toPNG())

    // Misma pregunta con la entrevista en español: la respuesta debe salir en español.
    ctx.settings.update({ interviewLanguage: 'es' })
    ctx.overlay!.webContents.send('settings:changed', ctx.settings.get())
    await sleep(500)
    const es = await ask('respuesta ES')
    check('Claude responde en español con entrevista en ES', es.a?.status === 'done' && guessLanguage(es.a.text) === 'es', es.a?.error ?? `total ${(es.total / 1000).toFixed(1)} s`)
    writeFileSync(join(outDir, 'live-02-es.png'), (await ctx.overlay!.webContents.capturePage()).toPNG())
    await js('window.__chuletaiTest.stop()')
  } catch (err) {
    check('prueba en vivo sin excepciones', false, err instanceof Error ? err.stack : String(err))
  }

  try {
    const logText = readFileSync(join(app.getPath('userData'), 'logs', 'chuletai.log'), 'utf8')
    console.log('--- registro:\n' + logText.split('\n').slice(-25).join('\n'))
  } catch {
    /* sin registro */
  }
  const failed = checks.filter((c) => !c.ok)
  writeFileSync(join(outDir, 'live-report.json'), JSON.stringify({ date: new Date().toISOString(), checks }, null, 2))
  console.log(`\n${checks.length - failed.length}/${checks.length} live checks passed.`)
  app.exit(failed.length ? 1 : 0)
}
