# ChuletAI

Copiloto personal para entrevistas y llamadas en Windows. Escucha la llamada, la transcribe en vivo separando al entrevistador (audio del sistema) de ti (micrófono) y, con un atajo, te sugiere qué decir en una ventana flotante que no aparece al compartir pantalla.

- Ventana transparente, siempre encima y que deja pasar los clics (se vuelve interactiva al pasar el mouse por un panel).
- Modo privado: oculta la ventana al compartir pantalla en Zoom, Meet o Teams.
- Transcripción en tiempo real con Deepgram Nova-3, en inglés, en español o mezclando los dos.
- Respuestas en streaming con Claude Haiku 5.5 (o Gemini Flash), cortas, en primera persona y en el idioma de la entrevista.
- Tres acciones: **Ayúdame** (responde a lo último que dijo el entrevistador), **Analizar pantalla** (captura y analiza lo que tienes en pantalla, por ejemplo un ejercicio de código) y **Mensaje directo** (una pregunta tuya).
- Contexto de la entrevista: hoja de vida (PDF o texto), descripción del cargo, empresa y notas.
- Interfaz en español e inglés.

> Las decisiones de diseño y sus motivos están en [DECISIONS.md](DECISIONS.md).

## Instalación

### Opción A: instalador

1. Genera el instalador (ver "Desarrollo") o usa uno ya generado: `release\ChuletAI-Setup-0.1.0.exe`.
2. Ejecútalo. Como no está firmado, Windows SmartScreen mostrará "Windows protegió su PC": pulsa **Más información → Ejecutar de todas formas**.
3. ChuletAI arranca en la bandeja del sistema (el rombo verde junto al reloj) y muestra la ventana flotante arriba a la derecha.

### Opción B: desde el código

Requisitos: Windows 10 (2004 o posterior) u 11, Node.js 20 o superior y git.

```powershell
npm install
npm run dev
```

Si `npm run dev` dice que Electron no está instalado (a veces el script de instalación no descarga el binario), ejecuta `node node_modules/electron/install.js` una vez.

## Configurar las claves

Abre **Ajustes** (el engranaje ⚙ de la ventana flotante o clic derecho en el icono de la bandeja → Ajustes).

| Servicio | Para qué | Dónde conseguir la clave | Pestaña |
|---|---|---|---|
| Anthropic | Respuestas con Claude Haiku 5.5 | https://console.anthropic.com → API Keys | IA |
| Deepgram | Transcripción en vivo | https://console.deepgram.com → API Keys (la cuenta nueva trae crédito gratis) | Transcripción |
| Google Gemini (opcional) | Proveedor alternativo | https://aistudio.google.com/apikey | IA → Proveedor: Gemini |

Pega cada clave y pulsa **Guardar**. Las claves se cifran con el almacén seguro de Windows (DPAPI, vía `safeStorage` de Electron) en `%APPDATA%\chuletai\keys.json`: no se guardan en texto plano, no van al código ni a git y la ventana nunca las ve.

Sin claves, la app funciona en **modo simulado** (etiqueta naranja "Simulado"): la transcripción es una entrevista de ejemplo y las respuestas son textos de ejemplo. Sirve para probar los atajos y la ventana. También se puede forzar desde Ajustes → General.

## Uso

1. **Antes de la llamada**, en Ajustes → Entrevista: elige el idioma de la entrevista, escribe la empresa y el cargo, pega la descripción del cargo, carga tu hoja de vida (PDF o texto) y añade notas (logros con cifras, historias para preguntas de comportamiento, rango salarial, preguntas que quieres hacer). Todo eso va en el prompt.
2. **Al empezar la llamada**, pulsa **Iniciar** en la ventana flotante. Windows puede pedir permiso para usar el micrófono. Los dos indicadores (🔊 sistema y 🎙 micrófono) muestran el nivel de audio.
3. Cuando el entrevistador pregunte algo, pulsa **Ctrl+Enter** (Ayúdame). La respuesta aparece en segundos: primero una línea en negrita que puedes decir tal cual y luego 2 a 4 puntos de apoyo.
4. Si te ponen un ejercicio en pantalla, pulsa **Ctrl+Shift+Enter** (Analizar pantalla).
5. Para preguntar algo tú, pulsa **Ctrl+Shift+Espacio** (o haz clic en la caja de texto), escribe y pulsa Enter.
6. Con **Traducir al EN/ES** pasas la respuesta al otro idioma, y con **Copiar** la copias.

**Idioma de la entrevista** (botones EN / ES / Auto en la barra superior):
- **EN** o **ES**: la transcripción y las respuestas van en ese idioma.
- **Auto**: Deepgram entiende inglés y español mezclados, y la respuesta sale en el idioma de la última pregunta del entrevistador.

**Mover la ventana:** arrastra el logo "◆ ChuletAI" o usa Ctrl+flechas. **Ocultarla:** Ctrl+H o el botón "–". **Salir:** clic derecho en el icono de la bandeja → Salir.

### Modo privado

Está **activado por defecto** (indicador "● Privado" en verde). Usa `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`, así que la ventana no sale al compartir pantalla en Zoom, Meet o Teams, ni en capturas o grabaciones. Lo puedes apagar con un clic en el indicador. Comprobado con capturas de `desktopCapturer` y de GDI: con el modo privado la ventana no aparece. Requiere Windows 10 2004 o posterior. En versiones más viejas sale un recuadro negro en su lugar.

## Atajos

| Atajo | Acción |
|---|---|
| Ctrl+Enter | Ayúdame: responder a la última pregunta |
| Ctrl+Shift+Enter | Analizar pantalla |
| Ctrl+H | Ocultar o mostrar la ventana |
| Ctrl+↑ ↓ ← → | Mover la ventana |
| Ctrl+Shift+← / → | Respuesta anterior o siguiente |
| Ctrl+Backspace | Limpiar la transcripción |
| Ctrl+Shift+Backspace | Limpiar las respuestas |
| Ctrl+Shift+Espacio | Volver la ventana interactiva y escribir una pregunta |

Son **globales**: mientras ChuletAI esté abierta, esas combinaciones dejan de llegar a las demás apps (por ejemplo, Ctrl+Backspace ya no borra palabras en Word). Si te estorba, en Ajustes → General → "Tecla de los atajos" elige **Ctrl+Alt**, y todos pasan a Ctrl+Alt+… (por ejemplo, Ctrl+Alt+Enter).

## Costos aproximados

Precios de lista a noviembre de 2026. Confírmalos en las páginas de cada proveedor.

| Concepto | Cálculo | Costo |
|---|---|---|
| Transcripción (Deepgram Nova-3, streaming) | Unos USD 0,006 a 0,009 por minuto **y por canal**. ChuletAI usa 2 canales (sistema y micrófono) | **USD 0,70 a 1,10 por hora** de llamada |
| Respuestas (Claude Haiku 5.5) | USD 0,10 por millón de tokens de entrada y 0,50 de salida. Cada "Ayúdame" usa unos 5.000 a 10.000 tokens de entrada (CV, cargo y transcripción) y unos 200 de salida | **unos USD 0,001 por respuesta**, es decir, unos 5 centavos por 50 respuestas |
| Analizar pantalla | Igual, más la imagen (unos 1.500 tokens) | unos USD 0,002 por captura |

Una entrevista de una hora con 30 consultas cuesta **alrededor de USD 1**, casi todo por la transcripción. El prompt del sistema se cachea, así que las consultas repetidas salen todavía más baratas. Deepgram regala crédito al crear la cuenta.

## Personalizar los prompts

Los prompts están en [`src/shared/prompts/`](src/shared/prompts/):

| Archivo | Uso |
|---|---|
| `system.md` | Reglas de estilo y contexto de la entrevista |
| `help.md`, `help-no-question.md` | Ayúdame |
| `screen.md` | Analizar pantalla |
| `direct.md` | Mensaje directo |
| `translate.md` | Traducir |
| `lang-en.md`, `lang-es.md`, `lang-auto.md` | Regla de idioma |
| `length-short.md`, `length-medium.md` | Largo de la respuesta |

Para ajustarlos **sin recompilar**, crea la carpeta `%APPDATA%\chuletai\prompts\` y pon un archivo con el mismo nombre (por ejemplo `system.md`). ChuletAI lo usa en lugar del que trae por defecto. Las variables `{{...}}` se reemplazan solas.

## Desarrollo

```powershell
npm run dev        # app con recarga en caliente
npm test           # pruebas unitarias (Vitest)
npm run typecheck  # TypeScript
npm run selftest   # autoprueba en la app real (ver abajo)
npm run selftest:live  # prueba en vivo con tus claves reales (Deepgram + Claude)
npm run build      # instalador en release\ChuletAI-Setup-<versión>.exe
```

**Autoprueba (`npm run selftest`).** Abre la app compilada con un perfil temporal y en modo simulado, y comprueba de verdad:

- Los estilos de la ventana (siempre encima, fuera de Alt+Tab, paso de clics).
- Que se vuelve interactiva al pasar el mouse por encima.
- El modo privado, con capturas de pantalla.
- El cifrado de claves.
- El cambio de idioma.
- Los atajos con pulsaciones reales.
- El flujo completo en inglés y español: transcripción → Ayúdame → respuesta, traducir y analizar pantalla.

Mueve el mouse y pulsa teclas durante unos 40 segundos, así que no toques nada mientras corre. Deja capturas y un `report.json` en `selftest-output\`.

**Estructura:**

```
src/main/        proceso principal: ventana, atajos, audio loopback, IA, Deepgram, ajustes y claves
src/preload/     puente seguro (window.chuletai)
src/renderer/    interfaz React (ventana flotante y ajustes) y captura de audio
src/shared/      lógica sin Electron: prompts, transcripción, i18n, atajos, tipos
tests/           pruebas unitarias
```

**Ubicación:** el proyecto vive en `C:\dev\ChuletAI`, fuera de OneDrive, porque OneDrive vuelve muy lento `npm install` al sincronizar `node_modules`. Ver [DECISIONS.md](DECISIONS.md#18-onedrive-y-node_modules-resuelto-proyecto-en-cdevchuletai).

## Privacidad

- El audio va a Deepgram y el texto (y las capturas, si usas "Analizar pantalla") va a Anthropic o Google, con tus propias claves. ChuletAI no tiene servidor propio.
- Los ajustes, el CV y las notas se guardan en `%APPDATA%\chuletai\settings.json`, sin cifrar. Las claves van cifradas en `keys.json`.
- Para borrarlo todo: desinstala la app y borra la carpeta `%APPDATA%\chuletai`.

## Problemas comunes

| Síntoma | Qué hacer |
|---|---|
| La transcripción se detiene o va atrasada | Mira el aviso naranja bajo "Transcripción" (reconectando, sin audio o subida lenta). El registro está en `%APPDATA%\chuletai\logs\chuletai.log`. Si la subida de internet va justa, cierra otras subidas (OneDrive, backups) o usa cable. |
| El indicador 🔊 o 🎙 aparece en rojo | Pasa el mouse por encima para ver el error. Para el micrófono: Configuración de Windows → Privacidad → Micrófono → permitir apps de escritorio. |
| No transcribe al entrevistador | El loopback captura lo que suena por la salida de audio predeterminada de Windows. Comprueba que la llamada suene por ese dispositivo. |
| "Anthropic: invalid API key (401)" | Revisa la clave en Ajustes → IA. |
| Los atajos no responden | Otra app puede tener registradas las mismas combinaciones. Cambia a Ctrl+Alt en Ajustes → General. |
| La ventana tapa algo | Ctrl+H para ocultarla, o arrástrala. Donde no hay paneles, los clics pasan a la app de abajo. |
