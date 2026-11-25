import { contextBridge, ipcRenderer } from 'electron'
import { EVENT_NAMES, type ChuletApi, type ChuletEvents } from '../shared/api'

const api: ChuletApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  getStatus: () => ipcRenderer.invoke('status:get'),
  setKey: (name, value) => ipcRenderer.invoke('keys:set', name, value),
  pickResume: () => ipcRenderer.invoke('resume:pick'),
  runAi: (req) => ipcRenderer.invoke('ai:run', req),
  cancelAi: (id) => ipcRenderer.send('ai:cancel', id),
  sttStart: () => ipcRenderer.invoke('stt:start'),
  sttAudio: (channel, pcm) => ipcRenderer.send('stt:audio', channel, pcm),
  sttStop: () => ipcRenderer.send('stt:stop'),
  setInteractive: (interactive) => ipcRenderer.send('overlay:interactive', interactive),
  moveBy: (dx, dy) => ipcRenderer.send('overlay:moveBy', dx, dy),
  hide: () => ipcRenderer.send('overlay:hide'),
  openSettings: () => ipcRenderer.send('settings:open'),
  quit: () => ipcRenderer.send('app:quit'),
  copyText: (text) => ipcRenderer.send('clipboard:write', text),
  log: (scope, message) => ipcRenderer.send('log', scope, message),
  on(event, listener) {
    if (!EVENT_NAMES.includes(event)) throw new Error(`Unknown event ${String(event)}`)
    const wrapped = (_e: Electron.IpcRendererEvent, payload: ChuletEvents[typeof event]): void => listener(payload)
    ipcRenderer.on(event, wrapped)
    return () => ipcRenderer.removeListener(event, wrapped)
  }
}

contextBridge.exposeInMainWorld('chuletai', api)
