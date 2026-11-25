// Ajustes en JSON (userData/settings.json) y claves de API cifradas con safeStorage
// (userData/keys.json, cada valor cifrado con DPAPI en Windows). Las claves nunca
// salen del proceso main: el renderer solo sabe si existen.

import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeSettings, type KeyName, type KeyStatus, type Settings } from '../shared/types'

const KEY_NAMES: KeyName[] = ['anthropic', 'gemini', 'deepgram']

function dataDir(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

/** Escritura atómica: primero a un temporal y luego rename. */
function writeJson(file: string, value: unknown): void {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  renameSync(tmp, file)
}

export class SettingsStore {
  private settings: Settings
  private readonly file: string

  constructor() {
    this.file = join(dataDir(), 'settings.json')
    this.settings = normalizeSettings(readJson(this.file))
  }

  get(): Settings {
    return this.settings
  }

  update(patch: Partial<Settings>): Settings {
    const merged = {
      ...this.settings,
      ...patch,
      context: { ...this.settings.context, ...(patch.context ?? {}) }
    }
    this.settings = normalizeSettings(merged)
    writeJson(this.file, this.settings)
    return this.settings
  }
}

export class KeyStore {
  private readonly file: string
  private encrypted: Partial<Record<KeyName, string>>
  /** Claves descifradas, solo en memoria del proceso main. */
  private plain: Partial<Record<KeyName, string>> = {}
  /** Claves inyectadas solo en memoria (variables de entorno en desarrollo). */
  private readonly memory: Partial<Record<KeyName, string>> = {}
  private available = false

  constructor() {
    this.file = join(dataDir(), 'keys.json')
    const raw = readJson(this.file)
    this.encrypted = raw && typeof raw === 'object' ? (raw as Partial<Record<KeyName, string>>) : {}
  }

  /** Descifra las claves guardadas. Llamar una vez, después de app.whenReady(). */
  async init(): Promise<void> {
    this.available = await safeStorage.isAsyncEncryptionAvailable()
    if (!this.available) return
    let changed = false
    for (const name of KEY_NAMES) {
      const stored = this.encrypted[name]
      if (!stored) continue
      try {
        const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(stored, 'base64'))
        this.plain[name] = result
        if (shouldReEncrypt) {
          this.encrypted[name] = (await safeStorage.encryptStringAsync(result)).toString('base64')
          changed = true
        }
      } catch {
        // Clave ilegible (p. ej. copiada de otro usuario de Windows): se ignora.
      }
    }
    if (changed) writeJson(this.file, this.encrypted)
  }

  encryptionAvailable(): boolean {
    return this.available
  }

  async set(name: KeyName, value: string): Promise<void> {
    if (!KEY_NAMES.includes(name)) throw new Error(`Unknown key ${name}`)
    const trimmed = value.trim()
    if (!trimmed) {
      delete this.encrypted[name]
      delete this.plain[name]
    } else {
      if (!this.available) throw new Error('safeStorage encryption is not available')
      this.encrypted[name] = (await safeStorage.encryptStringAsync(trimmed)).toString('base64')
      this.plain[name] = trimmed
    }
    writeJson(this.file, this.encrypted)
  }

  setInMemory(name: KeyName, value: string | undefined): void {
    if (value && value.trim()) this.memory[name] = value.trim()
  }

  get(name: KeyName): string | undefined {
    return this.plain[name] ?? this.memory[name]
  }

  status(): KeyStatus {
    return {
      anthropic: Boolean(this.get('anthropic')),
      gemini: Boolean(this.get('gemini')),
      deepgram: Boolean(this.get('deepgram'))
    }
  }
}
