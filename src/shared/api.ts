// Contrato entre el preload (window.chuletai) y el renderer.

import type {
  AiDelta,
  AiDone,
  AiRunRequest,
  AudioChannel,
  KeyName,
  RuntimeStatus,
  Settings,
  ShortcutAction,
  SttEvent,
  SttStatus
} from './types'

export interface ChuletEvents {
  'ai:delta': AiDelta
  'ai:done': AiDone
  'stt:event': SttEvent
  'stt:status': SttStatus
  shortcut: ShortcutAction
  'settings:changed': Settings
  'status:changed': RuntimeStatus
}

export type ResumeResult = { name: string; text: string } | { error: string } | null

export interface ChuletApi {
  getSettings(): Promise<Settings>
  updateSettings(patch: Partial<Settings>): Promise<Settings>
  getStatus(): Promise<RuntimeStatus>
  setKey(name: KeyName, value: string): Promise<RuntimeStatus>
  pickResume(): Promise<ResumeResult>
  runAi(req: AiRunRequest): Promise<void>
  cancelAi(id: string): void
  sttStart(): Promise<'live' | 'mock'>
  sttAudio(channel: AudioChannel, pcm: ArrayBuffer): void
  sttStop(): void
  setInteractive(interactive: boolean): void
  moveBy(dx: number, dy: number): void
  hide(): void
  openSettings(): void
  quit(): void
  copyText(text: string): void
  log(scope: string, message: string): void
  on<K extends keyof ChuletEvents>(event: K, listener: (payload: ChuletEvents[K]) => void): () => void
}

export const EVENT_NAMES: Array<keyof ChuletEvents> = [
  'ai:delta',
  'ai:done',
  'stt:event',
  'stt:status',
  'shortcut',
  'settings:changed',
  'status:changed'
]
