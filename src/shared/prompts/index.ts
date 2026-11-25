// Plantillas por defecto, empaquetadas con la app (Vite las importa como texto).
import type { PromptTemplates } from '../prompt'
import system from './system.md?raw'
import help from './help.md?raw'
import helpNoQuestion from './help-no-question.md?raw'
import screen from './screen.md?raw'
import direct from './direct.md?raw'
import translate from './translate.md?raw'
import langEn from './lang-en.md?raw'
import langEs from './lang-es.md?raw'
import langAuto from './lang-auto.md?raw'
import lengthShort from './length-short.md?raw'
import lengthMedium from './length-medium.md?raw'

export const DEFAULT_TEMPLATES: PromptTemplates = {
  system,
  help,
  'help-no-question': helpNoQuestion,
  screen,
  direct,
  translate,
  'lang-en': langEn,
  'lang-es': langEs,
  'lang-auto': langAuto,
  'length-short': lengthShort,
  'length-medium': lengthMedium
}
