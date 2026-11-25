# Decisiones de ChuletAI

Registro de las decisiones tomadas durante la construcción: qué se eligió, qué alternativas había y por qué.

## 1. Stack y herramientas

- **Decisión:** Electron 45 + electron-vite 6 (Vite 8) + React 19 + TypeScript 7. Pruebas con Vitest 5 y empaquetado con electron-builder 26 (instalador NSIS).
- **Alternativas:** Electron Forge con el plugin de Vite, o webpack.
- **Motivo:** electron-vite compila main, preload y renderer con una sola configuración, trae servidor de desarrollo con recarga y se lleva bien con electron-builder. Forge añade más piezas sin aportar nada aquí.

## 2. Transcripción: Deepgram Nova-3

- **Decisión:** Deepgram Nova-3 por WebSocket, con `language=multi` en modo "Automático / mixto" y `en` o `es` cuando el idioma es fijo.
- **Alternativa:** Speechmatics en tiempo real, que también tiene un modo bilingüe español-inglés.
- **Motivo:** Nova-3 multilingüe entiende inglés y español mezclados en la misma frase (code-switching) dentro de un solo stream, que es justo el caso "mixto". La API es simple (autenticación por cabecera y resultados parciales y finales), la latencia es baja, el precio es por minuto y la cuenta nueva trae crédito gratis para probar.

## 3. Una conexión por canal y WebSocket en el proceso main

- **Decisión:** dos conexiones a Deepgram, una para el audio del sistema (el entrevistador) y otra para el micrófono (yo). El WebSocket vive en el proceso main.
- **Alternativas:** una sola conexión `multichannel=true` con audio intercalado, o abrir el WebSocket en el renderer.
- **Motivo:** con dos conexiones cada canal se reconecta por su cuenta y el código es más simple, y Deepgram cobra igual (por canal). En el main se puede enviar la clave en la cabecera `Authorization` y la clave nunca llega al renderer. El navegador no deja poner cabeceras en un WebSocket.

## 4. Captura de audio con AudioWorklet y PCM de 16 kHz

- **Decisión:** `getDisplayMedia` (el main responde con `audio: 'loopback'` vía `setDisplayMediaRequestHandler`) para el sistema y `getUserMedia` con `echoCancellation` para el micrófono. Cada flujo pasa por un `AudioContext` a 16 kHz y un AudioWorklet que manda bloques de 100 ms en PCM de 16 bits por IPC.
- **Alternativa:** `MediaRecorder` con trozos WebM/Opus.
- **Motivo:** el PCM crudo tiene menos latencia (no hay que esperar a que se cierre cada contenedor) y es el formato más directo para Deepgram. La cancelación de eco del micrófono evita transcribir dos veces lo que suena por los parlantes.

## 5. IA: Claude Haiku 5.5 con esfuerzo bajo

- **Decisión:** `claude-haiku-5-5` con `@anthropic-ai/sdk` en streaming, `output_config.effort: 'low'` por defecto y pensamiento adaptativo (el que trae el modelo por defecto). "Analizar pantalla" sube como mínimo a `medium` porque suele ser un problema de código, y traducir va siempre en `low`. `max_tokens` es 16000 porque el pensamiento cuenta contra ese límite.
- **Alternativa:** apagar el pensamiento con `thinking: {type: 'disabled'}`, que Haiku 5.5 acepta en esfuerzo bajo.
- **Motivo:** la guía de Anthropic para Haiku 5.5 recomienda usar el esfuerzo como palanca en vez de apagar el pensamiento: en `low` el modelo piensa poco o nada en preguntas simples. El esfuerzo se puede cambiar en Ajustes.
- **Caché de prompts:** el prompt del sistema (reglas, CV, descripción del cargo y notas) es idéntico en toda la sesión y lleva `cache_control`. La transcripción va en el mensaje del usuario.
- **Rechazos:** Haiku 5.5 no admite `fallbacks` del lado del servidor. Si `stop_reason` es `refusal`, se muestra un error en la respuesta.

## 6. Proveedor de IA intercambiable y Gemini

- **Decisión:** interfaz `AiProvider` con tres implementaciones: Anthropic, Gemini (`@google/genai`, modelo por defecto `gemini-flash-latest`, editable en Ajustes) y una simulada.
- **Estado:** Gemini está implementado pero **no se probó con una clave real**. Con modelos 2.5 Flash y esfuerzo bajo usa `thinkingBudget: 0`.

## 7. Una petición por acción, sin historial de chat

- **Decisión:** cada "Ayúdame", "Analizar pantalla" o "Mensaje directo" es una petición independiente con la transcripción reciente (hasta 6000 caracteres, de lo más nuevo hacia atrás).
- **Alternativa:** mantener una conversación con el modelo.
- **Motivo:** menos tokens y menos latencia, y la transcripción ya da el contexto. Así tampoco hay que manejar el historial de bloques de pensamiento.

## 8. Prompts propios en archivos aparte

- **Decisión:** las plantillas están en `src/shared/prompts/*.md`. Las instrucciones están en inglés y la regla de idioma va en un archivo aparte por idioma (`lang-en`, `lang-es`, `lang-auto`). La de español incluye una frase en español para reforzarla. Para ajustarlas sin recompilar, se puede poner un archivo con el mismo nombre en `%APPDATA%\chuletai\prompts\`.
- **Motivo:** los modelos siguen bien las instrucciones en inglés y el idioma de salida lo fija la regla de idioma. Las respuestas siguen este formato: primero una línea en negrita lista para decir, luego 2 a 4 viñetas, en primera persona y sin inventar datos que no estén en el CV o las notas.

## 9. Ventana flotante en Windows

- **Decisión:** `transparent`, `frame: false`, `alwaysOnTop` en nivel `screen-saver`, `skipTaskbar`, `setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true})`, `setIgnoreMouseEvents(true, {forward: true})` y además **`type: 'toolbar'`**.
- **Motivo:** en Windows `setVisibleOnAllWorkspaces` no hace nada (solo existe en macOS y Linux) y `skipTaskbar` no saca la ventana de Alt+Tab. `type: 'toolbar'` activa `WS_EX_TOOLWINDOW`, que la saca de la barra de tareas y de Alt+Tab. Las ventanas de herramientas tampoco quedan atadas a un escritorio virtual. La autoprueba comprueba los estilos Win32 (`WS_EX_TOPMOST`, `WS_EX_TOOLWINDOW`, `WS_EX_LAYERED` y `WS_EX_TRANSPARENT`). **No se probó cambiando de escritorio virtual de verdad.**
- **Paso de clics:** los paneles llevan `data-interactive`. Con `forward: true` el renderer recibe `mousemove` aunque la ventana deje pasar los clics. Al entrar en un panel se desactiva el paso de clics y al salir se vuelve a activar.
- **Arrastre:** la ventana se mueve arrastrando el logo (lo hace el main por IPC). No se usa `-webkit-app-region: drag` porque en esa zona el renderer deja de recibir eventos de mouse y se rompe la detección del paso del mouse.

## 10. Modo privado

- **Decisión:** `setContentProtection(privateMode)` en la ventana flotante y en la de Ajustes, **activado por defecto**.
- **Verificación:** la autoprueba comprueba que la afinidad de la ventana sea `WDA_EXCLUDEFROMCAPTURE` (0x11) y compara capturas de `desktopCapturer`. Con el modo privado la captura queda igual a la de la ventana oculta (diferencia 0.0). Sin el modo privado, la ventana aparece.

## 11. Capturas de pantalla con desktopCapturer

- **Decisión:** `desktopCapturer.getSources` de la pantalla donde está la ventana, reducida a 1568 px en el lado largo y en JPEG con calidad 80.
- **Alternativa:** el paquete `screenshot-desktop`.
- **Motivo:** no añade dependencias nativas. Si el modo privado está apagado, se activa la protección de contenido durante la captura para que la propia ventana no salga en la imagen.

## 12. Atajos globales

- **Decisión:** los pedidos (Ctrl+Enter, Ctrl+Shift+Enter, Ctrl+H, Ctrl+flechas, Ctrl+Shift+←/→, Ctrl+Backspace y Ctrl+Shift+Backspace), más **Ctrl+Shift+Espacio** para volver la ventana interactiva y escribir un mensaje directo (el "atajo" que pide el punto 1).
- **Riesgo:** como son globales, mientras ChuletAI está abierta esas teclas dejan de funcionar en las demás apps (por ejemplo, Ctrl+Backspace ya no borra palabras y Ctrl+flechas ya no salta palabras). Por eso en Ajustes se puede cambiar el modificador a **Ctrl+Alt**.

## 13. Interfaz bilingüe

- **Decisión:** i18n propio de unas 60 líneas (`src/shared/i18n.ts`), con las claves tipadas para que TypeScript exija las mismas claves en ambos idiomas. Por defecto usa el idioma del sistema (`app.getLocale()`): español si empieza por `es`, si no inglés.
- **Alternativa:** i18next.
- **Motivo:** son dos idiomas y pocas cadenas. Así no hay dependencias y se puede probar en Node.

## 14. Ajustes y claves

- **Decisión:** los ajustes van en `%APPDATA%\chuletai\settings.json`. Las claves van en `keys.json`, cifradas con `safeStorage` (DPAPI en Windows) usando la API asíncrona (`encryptStringAsync`/`decryptStringAsync`), porque la síncrona está obsoleta en Electron 45. El renderer solo sabe si cada clave existe. En desarrollo (`npm run dev`) también se leen `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY` y `GEMINI_API_KEY` del entorno, pero solo en memoria.

## 15. Modo simulado

- **Decisión:** si falta la clave del proveedor activo o se activa "Modo simulado" en Ajustes, esa parte funciona simulada: la transcripción reproduce una entrevista de ejemplo (en inglés, en español o mezclada) y las respuestas son textos de ejemplo en streaming. Se muestra una etiqueta naranja "Simulado" y cada respuesta lo dice.
- **Motivo:** se puede probar todo sin claves y la etiqueta evita confundir lo simulado con lo real.

## 16. Hoja de vida en PDF

- **Decisión:** el texto se extrae en local con `unpdf` y se guarda en los ajustes. Se puede editar a mano.
- **Alternativa:** mandar el PDF como bloque `document` a Claude.
- **Motivo:** así sirve igual para Claude y para Gemini, el texto queda en el prompt del sistema (que se cachea) y el usuario puede corregir lo que se extrajo mal.

## 17. Referencia (ParakeetAI)

- **Decisión:** no se extrajo `app.asar`. Bastó con el resumen de la sesión anterior (configuración de la ventana, loopback y Speechmatics) y la documentación de Electron. No se copió código, nombre, textos ni imágenes. El icono es propio, generado con un script.

## 18. OneDrive y node_modules (resuelto: proyecto en C:\dev\ChuletAI)

- **Problema:** el proyecto está en `OneDrive\Documentos`. El primer `npm install` se colgó (conexiones abiertas sin avanzar) y hubo que reiniciarlo. La primera tanda de paquetes tardó unos 10 minutos y la segunda 3, porque OneDrive sincroniza cada archivo de `node_modules` (son miles).
- **Solución aplicada (24-11-2026):** el proyecto se movió a `C:\dev\ChuletAI`, fuera de OneDrive, a pedido del usuario. No se renombró la carpeta porque estaba en uso: se copió con robocopy (sin `out`, `release` ni `selftest-output`, que se regeneran) y se borró la original. El respaldo será un repositorio en GitHub (pendiente). Resultado: `npm ci` tarda 24 s en `C:\dev`, frente a unos 13 min en OneDrive. Ojo: el `/XD out` de robocopy también se saltó las carpetas `out` dentro de `node_modules` (por ejemplo, la de electron-builder), así que hubo que reinstalar con `npm ci`.
- `node_modules`, `out`, `release` y `selftest-output` están en `.gitignore`.

## 19. Pruebas

- **Unitarias (Vitest, 46 pruebas):** armado de prompts, transcripción, i18n, atajos, normalización de ajustes, URL y mensajes de Deepgram, conversión a PCM y lectura del CV (con un PDF de prueba).
- **Autoprueba en la app real (`npm run selftest`, 35 comprobaciones):** abre la app compilada con un perfil temporal y en modo simulado. Revisa los estilos Win32, el paso de clics con movimientos reales del mouse (`mouse_event`), el modo privado (afinidad y capturas), las claves cifradas, el cambio de idioma de la interfaz y de Ajustes, los atajos con pulsaciones reales (`keybd_event`) y el flujo completo en inglés y español. También cubre traducir, analizar pantalla y la captura de audio (loopback y micrófono sin errores). El modo privado se verifica contando píxeles del verde de ChuletAI en la región de la ventana: unos 8.400 sin modo privado y 0 con él. Comparar contra la captura con la ventana oculta resultó poco fiable, porque al ocultarla cambia la app que queda debajo. Guarda capturas en `selftest-output/`.
- **Resultados:** 35/35 en `npm run selftest` (versión compilada) y 35/35 en dos corridas del ejecutable empaquetado (`release\win-unpacked\ChuletAI.exe --selftest`, que guarda la salida en `%TEMP%\chuletai-selftest-output`). `npm run dev` abre la ventana flotante (verificado por Win32: ventana visible con afinidad 0x11).
- **Nota:** la autoprueba mueve el mouse y pulsa teclas durante unos 40 segundos. Es mejor no tocar nada mientras corre.

## 20. Empaquetado

- **Decisión:** instalador NSIS sin firma de código, para uso personal. Windows SmartScreen mostrará el aviso "Windows protegió su PC" la primera vez ("Más información" → "Ejecutar de todas formas"). No hay actualización automática.

## 21. Red inestable: audio en Opus, DNS de respaldo y reconexión (24-11-2026)

- **Problema observado en una llamada real:** la transcripción funcionó unos segundos y se detuvo para siempre, aunque se pulsara Detener/Iniciar.
- **Diagnóstico** (medido en el equipo del usuario):
  1. La resolución de nombres de Windows (`getaddrinfo`) falla de forma intermitente para `api.deepgram.com`. Sus registros duran solo 10 s, así que cada reconexión vuelve a preguntar, y Windows guarda el fallo en caché. Por eso Iniciar/Detener no ayudaba. Un DNS público (1.1.1.1 / 8.8.8.8) responde siempre.
  2. Con la videollamada en curso, la subida de internet va saturada. El PCM sin comprimir (256 kbps por canal) se acumulaba y las transcripciones llegaban con 20 a 30 s de retraso. Abrir la conexión llegó a tardar más de 10 s.
- **Decisiones:**
  - **Audio en WebM/Opus a 32 kbps con MediaRecorder**, unas 8 veces menos datos. Cada conexión nueva necesita la cabecera WebM, así que el main avisa de cada conexión abierta (`session`) y el renderer reinicia el grabador.
  - **`RobustResolver`**: DNS del sistema → DNS públicos → última IP buena. Tras un fallo del sistema, consulta primero el público durante 10 min.
  - **Reconexión sin fin** (0,5 a 8 s), salvo con 401/402/403. Handshake de 20 s.
  - **Avisos visibles** en la ventana: reconectando, sin audio, subida lenta (más de 10 s de audio pendiente).
  - **Registro en `%APPDATA%\chuletai\logs\chuletai.log`**, sin claves ni texto de la transcripción.
  - La captura se reinicia sola si Windows termina una pista (por ejemplo, al cambiar de auriculares), y el contexto de audio se reanuda si se suspende.
  - **Cliente de IA reutilizado** entre consultas, para no abrir una conexión TLS cada vez: el primer texto bajó de 12 a 26 s a 1,2 s en la misma red.
- **Alternativa descartada:** bajar a 8 kHz en mulaw (64 kbps). Ahorra menos que Opus y transcribe peor.
- **Verificación:** `npm run selftest:live` usa las claves reales e inyecta voz sintetizada en inglés como audio del sistema, sin usar los parlantes. Resultado: 7/7. Deepgram transcribió en unos 9 s y Claude respondió en inglés y en español en unos 1,5 s. La transcripción en español no se probó con audio porque Windows solo tiene voces en inglés.
