import type { ShortcutAction, ShortcutModifier } from './types'

/** Tecla (sin modificador base) y si lleva Shift, para cada acción. */
const BINDINGS: Array<{ action: ShortcutAction; key: string; shift?: boolean }> = [
  { action: 'help', key: 'Enter' },
  { action: 'screen', key: 'Enter', shift: true },
  { action: 'toggleVisibility', key: 'H' },
  { action: 'moveUp', key: 'Up' },
  { action: 'moveDown', key: 'Down' },
  { action: 'moveLeft', key: 'Left' },
  { action: 'moveRight', key: 'Right' },
  { action: 'prevAnswer', key: 'Left', shift: true },
  { action: 'nextAnswer', key: 'Right', shift: true },
  { action: 'clearTranscript', key: 'Backspace' },
  { action: 'clearAnswers', key: 'Backspace', shift: true },
  { action: 'focusInput', key: 'Space', shift: true }
]

/** Acelerador de Electron, p. ej. "Control+Shift+Enter". */
export function acceleratorFor(action: ShortcutAction, modifier: ShortcutModifier): string {
  const b = BINDINGS.find((x) => x.action === action)
  if (!b) throw new Error(`Unknown shortcut action: ${action}`)
  return [modifier, b.shift ? 'Shift' : null, b.key].filter(Boolean).join('+')
}

export function allAccelerators(modifier: ShortcutModifier): Array<{ action: ShortcutAction; accelerator: string }> {
  return BINDINGS.map((b) => ({ action: b.action, accelerator: acceleratorFor(b.action, modifier) }))
}

const KEY_LABEL: Record<string, string> = {
  Control: 'Ctrl',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Space: 'Space'
}

/** Etiqueta legible para la interfaz, p. ej. "Ctrl+Shift+Enter". */
export function shortcutLabel(action: ShortcutAction, modifier: ShortcutModifier): string {
  return acceleratorFor(action, modifier)
    .split('+')
    .map((part) => KEY_LABEL[part] ?? part)
    .join('+')
}
