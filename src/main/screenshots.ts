// Capturas para el README (npm run screenshots). Usa el perfil temporal de la autoprueba,
// el modo simulado y la interfaz en inglés, y guarda los PNG en docs/images.
// No usa atajos globales, así que funciona aunque la app instalada esté abierta.

import { app, type BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppContext } from './index'

interface Helpers {
  openSettings: () => void
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function waitFor<T>(fn: () => T | Promise<T>, timeoutMs: number): Promise<T | undefined> {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    try {
      const v = await fn()
      if (v) return v
    } catch {
      /* reintenta */
    }
    await sleep(150)
  }
  return undefined
}

/** Captura solo la parte ocupada de la ventana (la ventana flotante es más alta que su contenido). */
async function shot(win: BrowserWindow, file: string, selector?: string): Promise<void> {
  let rect: Electron.Rectangle | undefined
  if (selector) {
    const r = await win.webContents.executeJavaScript(
      `(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
        return { x: 0, y: 0, width: Math.ceil(window.innerWidth), height: Math.ceil(b.bottom + 8) } })()`,
      true
    )
    rect = r as Electron.Rectangle
  }
  const img = await win.webContents.capturePage(rect)
  writeFileSync(file, img.toPNG())
  console.log(`saved ${file}`)
}

export async function runScreenshots(ctx: AppContext, helpers: Helpers): Promise<void> {
  const outDir = join(app.getAppPath(), 'docs', 'images')
  mkdirSync(outDir, { recursive: true })
  try {
    ctx.settings.update({
      simulation: true,
      privateMode: true,
      uiLanguage: 'en',
      interviewLanguage: 'en',
      context: {
        company: 'Acme Corp',
        role: 'Senior Data Analyst',
        jobDescription:
          'We are looking for a data analyst to own our reporting pipeline, work with product and design, and turn messy data into clear decisions.',
        resume: '',
        resumeFileName: '',
        notes: 'Cut report generation from 2 days to 2 hours. Led the migration to dbt.'
      }
    })
    const win = ctx.overlay!
    const js = <T>(code: string): Promise<T> => win.webContents.executeJavaScript(code, true) as Promise<T>
    await waitFor(() => win.isVisible(), 15_000)
    await waitFor(() => js<boolean>('Boolean(window.__chuletaiTest)'), 15_000)
    win.webContents.send('settings:changed', ctx.settings.get())
    await sleep(800)

    // 1. Transcripción simulada en curso.
    await js('window.__chuletaiTest.start()')
    await waitFor(
      async () =>
        (await js<{ segments: Array<{ speaker: string }> }>('window.__chuletaiTest.state()')).segments.filter(
          (s) => s.speaker === 'interviewer'
        ).length >= 2,
      20_000
    )
    await sleep(500)
    await shot(win, join(outDir, 'transcript.png'), '.overlay')

    // 2. "Help me" con la respuesta terminada.
    await js('window.__chuletaiTest.help()')
    await waitFor(async () => {
      const s = await js<{ answers: Array<{ status: string }> }>('window.__chuletaiTest.state()')
      return s.answers.length > 0 && s.answers[s.answers.length - 1].status === 'done'
    }, 20_000)
    await js('window.__chuletaiTest.stop()')
    await sleep(600)
    await shot(win, join(outDir, 'answer.png'), '.overlay')

    // 3. Ajustes: contexto de la entrevista y transcripción (selector de micrófono).
    helpers.openSettings()
    const sw = await waitFor(() => (ctx.settingsWin && ctx.settingsWin.isVisible() ? ctx.settingsWin : undefined), 10_000)
    if (!sw) throw new Error('settings window did not open')
    sw.webContents.send('settings:changed', ctx.settings.get())
    await sleep(1000)
    await shot(sw, join(outDir, 'settings-interview.png'))
    const clickTab = (label: string): Promise<unknown> =>
      sw.webContents.executeJavaScript(
        `[...document.querySelectorAll('.tabs button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}).click()`,
        true
      )
    await clickTab('Transcription')
    await sleep(800)
    await shot(sw, join(outDir, 'settings-transcription.png'))
    await clickTab('Shortcuts')
    await sleep(600)
    await shot(sw, join(outDir, 'settings-shortcuts.png'))
    sw.close()
  } catch (err) {
    console.error('screenshots failed:', err)
    app.exit(1)
    return
  }
  app.exit(0)
}
