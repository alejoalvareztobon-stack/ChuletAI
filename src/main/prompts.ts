// Carga de plantillas: las empaquetadas por defecto, o una versión propia en
// <userData>/prompts/<nombre>.md si el usuario quiere ajustarlas sin recompilar.

import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TEMPLATE_NAMES, type PromptTemplates } from '../shared/prompt'
import { DEFAULT_TEMPLATES } from '../shared/prompts'

export function loadTemplates(): PromptTemplates {
  const dir = join(app.getPath('userData'), 'prompts')
  const out = { ...DEFAULT_TEMPLATES }
  if (!existsSync(dir)) return out
  for (const name of TEMPLATE_NAMES) {
    const file = join(dir, `${name}.md`)
    if (existsSync(file)) {
      try {
        out[name] = readFileSync(file, 'utf8')
      } catch {
        // Si no se puede leer, se queda la plantilla por defecto.
      }
    }
  }
  return out
}
