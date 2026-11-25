// Ventana flotante: transparente, sin bordes, siempre encima (nivel screen-saver),
// en todos los escritorios y con paso de clics hasta que el mouse entra en un panel.

import { BrowserWindow, desktopCapturer, screen } from 'electron'
import { join } from 'node:path'
import type { AiImage } from './ai/provider'

export const OVERLAY_SIZE = { width: 500, height: 720 }

export function loadRenderer(win: BrowserWindow, page: 'overlay' | 'settings'): Promise<void> {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) return win.loadURL(`${devUrl}/${page}.html`)
  return win.loadFile(join(__dirname, `../renderer/${page}.html`))
}

export function createOverlayWindow(privateMode: boolean): BrowserWindow {
  const work = screen.getPrimaryDisplay().workArea
  const width = OVERLAY_SIZE.width
  const height = Math.min(OVERLAY_SIZE.height, work.height - 40)
  const win = new BrowserWindow({
    width,
    height,
    x: work.x + work.width - width - 24,
    y: work.y + 24,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    title: 'ChuletAI',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setIgnoreMouseEvents(true, { forward: true })
  win.setContentProtection(privateMode)
  win.once('ready-to-show', () => win.showInactive())
  // Algunos programas en pantalla completa le quitan el "siempre encima": lo reafirmamos.
  win.on('blur', () => win.setAlwaysOnTop(true, 'screen-saver'))
  return win
}

/** Activa o desactiva el paso de clics. interactive=true => la ventana recibe el mouse. */
export function setInteractive(win: BrowserWindow, interactive: boolean): void {
  if (interactive) win.setIgnoreMouseEvents(false)
  else win.setIgnoreMouseEvents(true, { forward: true })
}

/** Mueve la ventana sin salirse del área visible de la pantalla en la que está. */
export function moveWindowBy(win: BrowserWindow, dx: number, dy: number): void {
  const b = win.getBounds()
  const work = screen.getDisplayMatching(b).workArea
  const allDisplays = screen.getAllDisplays()
  const minX = Math.min(...allDisplays.map((d) => d.workArea.x)) - b.width + 80
  const maxX = Math.max(...allDisplays.map((d) => d.workArea.x + d.workArea.width)) - 80
  const x = Math.round(Math.min(maxX, Math.max(minX, b.x + dx)))
  const y = Math.round(Math.min(work.y + work.height - 60, Math.max(work.y - b.height + 60, b.y + dy)))
  win.setPosition(x, y)
}

const MAX_IMAGE_EDGE = 1568

/**
 * Captura la pantalla donde está la ventana con desktopCapturer.
 * La propia ventana se excluye activando la protección de contenido durante la captura.
 */
export async function captureScreen(win: BrowserWindow, privateMode: boolean): Promise<AiImage> {
  const display = screen.getDisplayMatching(win.getBounds())
  const w = display.size.width * display.scaleFactor
  const h = display.size.height * display.scaleFactor
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(w, h))
  const thumbnailSize = { width: Math.round(w * scale), height: Math.round(h * scale) }

  if (!privateMode) {
    win.setContentProtection(true)
    await new Promise((r) => setTimeout(r, 150))
  }
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize })
    const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
    if (!source) throw new Error('No screen source available')
    return { base64: source.thumbnail.toJPEG(80).toString('base64'), mediaType: 'image/jpeg' }
  } finally {
    if (!privateMode) win.setContentProtection(false)
  }
}
