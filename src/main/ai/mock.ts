// Proveedor simulado: devuelve respuestas de ejemplo en streaming, sin red.

import type { AiProvider, AiStreamRequest } from './provider'

const SAMPLES: Record<'en' | 'es', Record<'help' | 'screen' | 'direct' | 'translate', string>> = {
  en: {
    help: `**I'd describe myself as someone who turns messy problems into simple, working systems.**

- In my last role I cut report time from **2 days to 2 hours** by automating the data pipeline.
- I work closely with product and design, so I ask "why" before I build.
- I'm looking for a team where I can own a product area end to end.

_(Simulated answer — add your API key in Settings for real ones.)_`,
    screen: `**Use a hash map to find the pair in one pass.**

\`\`\`python
def two_sum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i
\`\`\`

- Time **O(n)**, space **O(n)**.
- Say: "I trade a bit of memory for a single pass."

_(Simulated answer.)_`,
    direct: `**Short answer:** ask about the team's biggest challenge this quarter.

- It shows interest in their real problems.
- It helps you connect your experience to them.

_(Simulated answer.)_`,
    translate: `**I'd describe myself as someone who turns messy problems into simple, working systems.**

- I automated the data pipeline and cut report time from **2 days to 2 hours**.

_(Simulated translation.)_`
  },
  es: {
    help: `**Me describiría como alguien que convierte problemas enredados en sistemas simples que funcionan.**

- En mi último trabajo bajé el tiempo de los reportes de **2 días a 2 horas** automatizando el flujo de datos.
- Trabajo muy de cerca con producto y diseño: pregunto el "por qué" antes de construir.
- Busco un equipo donde pueda encargarme de un área del producto de punta a punta.

_(Respuesta simulada: agrega tu clave en Ajustes para obtener respuestas reales.)_`,
    screen: `**Uso un diccionario para encontrar el par en una sola pasada.**

\`\`\`python
def two_sum(nums, target):
    vistos = {}
    for i, n in enumerate(nums):
        if target - n in vistos:
            return [vistos[target - n], i]
        vistos[n] = i
\`\`\`

- Tiempo **O(n)**, espacio **O(n)**.
- Di: "Cambio un poco de memoria por una sola pasada".

_(Respuesta simulada.)_`,
    direct: `**Respuesta corta:** pregunta cuál es el mayor reto del equipo este trimestre.

- Demuestra interés en sus problemas reales.
- Te ayuda a conectar tu experiencia con lo que necesitan.

_(Respuesta simulada.)_`,
    translate: `**Me describiría como alguien que convierte problemas enredados en sistemas simples que funcionan.**

- Automaticé el flujo de datos y bajé el tiempo de los reportes de **2 días a 2 horas**.

_(Traducción simulada.)_`
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true }
    )
  })
}

export class MockProvider implements AiProvider {
  readonly id = 'mock' as const

  constructor(
    private readonly kind: 'help' | 'screen' | 'direct' | 'translate',
    private readonly delayMs = 25
  ) {}

  async stream(req: AiStreamRequest): Promise<void> {
    const text = SAMPLES[req.language][this.kind]
    await sleep(250, req.signal)
    // Trozos de 1-3 palabras, como un stream real.
    const tokens = text.match(/\S+\s*|\s+/g) ?? [text]
    for (let i = 0; i < tokens.length; i += 2) {
      req.onText(tokens.slice(i, i + 2).join(''))
      await sleep(this.delayMs, req.signal)
    }
  }
}
