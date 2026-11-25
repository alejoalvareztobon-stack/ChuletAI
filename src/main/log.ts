// Registro en archivo: %APPDATA%\chuletai\logs\chuletai.log (rota a .old al pasar de 1 MB).
// Nunca se registran claves ni el contenido de la transcripción.

import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

let file: string | null = null

function logFile(): string {
  if (file) return file
  const dir = join(app.getPath('userData'), 'logs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  file = join(dir, 'chuletai.log')
  return file
}

export function log(scope: string, message: string): void {
  const line = `${new Date().toISOString()} [${scope}] ${message}\n`
  try {
    const f = logFile()
    if (existsSync(f) && statSync(f).size > 1_000_000) renameSync(f, `${f}.old`)
    appendFileSync(f, line, 'utf8')
  } catch {
    // El registro nunca debe romper la app.
  }
  if (!app.isPackaged) process.stdout.write(line)
}

export function logPath(): string {
  return logFile()
}
