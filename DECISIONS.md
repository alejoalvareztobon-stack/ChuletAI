# ChuletAI design decisions

A log of the decisions made while building ChuletAI: what was chosen, what the alternatives were, and why.

## 1. Stack and tooling

- **Decision:** Electron 45 + electron-vite 6 (Vite 8) + React 19 + TypeScript 7. Tests with Vitest 5, packaging with electron-builder 26 (NSIS installer).
- **Alternatives:** Electron Forge with the Vite plugin, or webpack.
- **Why:** electron-vite builds main, preload and renderer from one config, ships a dev server with hot reload and works well with electron-builder. Forge adds more moving parts without any benefit here.

## 2. Transcription: Deepgram Nova-3

- **Decision:** Deepgram Nova-3 over WebSocket, with `language=multi` in "Auto / mixed" mode and `en` or `es` when the language is fixed.
- **Alternative:** Speechmatics real-time, which also has a bilingual Spanish-English mode.
- **Why:** multilingual Nova-3 understands English and Spanish mixed in the same sentence (code-switching) within a single stream, which is exactly the "mixed" case. The API is simple (header auth, interim and final results), latency is low, pricing is per minute and new accounts get free credit.

## 3. One connection per channel, WebSocket in the main process

- **Decision:** two Deepgram connections, one for system audio (the interviewer) and one for the microphone (me). The WebSocket lives in the main process.
- **Alternatives:** a single `multichannel=true` connection with interleaved audio, or opening the WebSocket in the renderer.
- **Why:** with two connections each channel reconnects on its own and the code is simpler, and Deepgram bills the same (per channel). In the main process the key can go in the `Authorization` header and never reaches the renderer; browsers don't allow custom headers on a WebSocket.

## 4. Audio capture (original design, superseded by #21)

- **Original decision:** `getDisplayMedia` (the main process answers with `audio: 'loopback'` via `setDisplayMediaRequestHandler`) for system audio and `getUserMedia` with `echoCancellation` for the microphone. Each stream went through a 16 kHz `AudioContext` and an AudioWorklet sending 100 ms blocks of 16-bit PCM over IPC.
- **Why at the time:** raw PCM has lower latency (no waiting for each container chunk to close) and is the most direct format for Deepgram. Echo cancellation on the microphone avoids transcribing twice what comes out of the speakers.
- **Now:** audio is sent as WebM/Opus (see #21). The AudioWorklet is still used, but only to measure levels.

## 5. AI: Claude Haiku 5.5 at low effort

- **Decision:** `claude-haiku-5-5` via `@anthropic-ai/sdk` with streaming, `output_config.effort: 'low'` by default and adaptive thinking (the model's default). "Analyze screen" goes up to at least `medium`, since it's usually a coding problem; translation always uses `low`. `max_tokens` is 16000 because thinking counts against that limit.
- **Alternative:** disabling thinking with `thinking: {type: 'disabled'}`, which Haiku 5.5 accepts at low effort.
- **Why:** Anthropic's guidance for Haiku 5.5 recommends using effort as the lever instead of disabling thinking. At `low` the model thinks little or not at all on simple questions. Effort can be changed in Settings.
- **Prompt caching:** the system prompt (rules, resume, job description and notes) is identical for the whole session and carries `cache_control`. The transcript goes in the user message.
- **Refusals:** Haiku 5.5 doesn't support server-side `fallbacks`. If `stop_reason` is `refusal`, the answer shows an error.

## 6. Swappable AI provider and Gemini

- **Decision:** an `AiProvider` interface with three implementations: Anthropic, Gemini (`@google/genai`, default model `gemini-flash-latest`, editable in Settings) and a simulated one.
- **Status:** Gemini is implemented but **has not been tested with a real key**. With 2.5 Flash models at low effort it uses `thinkingBudget: 0`.

## 7. One request per action, no chat history

- **Decision:** each "Help me", "Analyze screen" or direct question is an independent request with the recent transcript (up to 6000 characters, newest first).
- **Alternative:** keeping a conversation with the model.
- **Why:** fewer tokens and less latency, and the transcript already provides the context. It also avoids managing the history of thinking blocks.

## 8. Prompts in separate files

- **Decision:** templates live in `src/shared/prompts/*.md`. Instructions are in English and the language rule is a separate file per language (`lang-en`, `lang-es`, `lang-auto`); the Spanish one includes a sentence in Spanish to reinforce it. To tweak them without rebuilding, drop a file with the same name in `%APPDATA%\ChuletAI\prompts\`.
- **Why:** models follow English instructions well and the output language is set by the language rule. Answers follow this format: a bold line ready to say, then 2–4 bullets, in the first person, without inventing facts that aren't in the resume or notes.

## 9. Floating window on Windows

- **Decision:** `transparent`, `frame: false`, `alwaysOnTop` at `screen-saver` level, `skipTaskbar`, `setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true})`, `setIgnoreMouseEvents(true, {forward: true})`, plus **`type: 'toolbar'`**.
- **Why:** on Windows `setVisibleOnAllWorkspaces` does nothing (it only exists on macOS and Linux) and `skipTaskbar` doesn't remove the window from Alt+Tab. `type: 'toolbar'` sets `WS_EX_TOOLWINDOW`, which removes it from the taskbar and Alt+Tab. Tool windows also aren't tied to a virtual desktop. The self-test checks the Win32 styles (`WS_EX_TOPMOST`, `WS_EX_TOOLWINDOW`, `WS_EX_LAYERED` and `WS_EX_TRANSPARENT`). **Not tested by actually switching virtual desktops.**
- **Click-through:** panels carry `data-interactive`. With `forward: true` the renderer still gets `mousemove` while the window lets clicks through. Entering a panel turns click-through off; leaving turns it back on.
- **Dragging:** the window moves by dragging the logo (the main process does it over IPC). `-webkit-app-region: drag` isn't used because the renderer stops receiving mouse events in that area, which breaks hover detection.

## 10. Private mode

- **Decision:** `setContentProtection(privateMode)` on the overlay and the Settings window, **on by default**.
- **Verification:** the self-test checks that the window affinity is `WDA_EXCLUDEFROMCAPTURE` (0x11) and compares `desktopCapturer` captures: with private mode on, the window doesn't appear; with it off, it does.

## 11. Screenshots with desktopCapturer

- **Decision:** `desktopCapturer.getSources` for the display the window is on, scaled to 1568 px on the long side, JPEG at quality 80.
- **Alternative:** the `screenshot-desktop` package.
- **Why:** no native dependencies. If private mode is off, content protection is turned on during the capture so the window itself doesn't show up in the image.

## 12. Global shortcuts

- **Decision:** Ctrl+Enter, Ctrl+Shift+Enter, Ctrl+H, Ctrl+arrows, Ctrl+Shift+←/→, Ctrl+Backspace and Ctrl+Shift+Backspace, plus **Ctrl+Shift+Space** to make the window interactive and type a direct question.
- **Risk:** because they're global, those keys stop working in other apps while ChuletAI runs (for example, Ctrl+Backspace no longer deletes words and Ctrl+arrows no longer jump words). That's why Settings lets you switch the modifier to **Ctrl+Alt**.

## 13. Bilingual UI

- **Decision:** a home-grown i18n of about 60 lines (`src/shared/i18n.ts`), with typed keys so TypeScript requires the same keys in both languages. It defaults to the system language (`app.getLocale()`): Spanish if it starts with `es`, English otherwise.
- **Alternative:** i18next.
- **Why:** two languages and few strings. No dependencies, and it can be tested in Node.

## 14. Settings and keys

- **Decision:** settings are stored in `%APPDATA%\ChuletAI\settings.json`. Keys go in `keys.json`, encrypted with `safeStorage` (DPAPI on Windows) using the async API (`encryptStringAsync`/`decryptStringAsync`), since the sync one is deprecated in Electron 45. The renderer only knows whether each key exists. In development (`npm run dev`) `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY` and `GEMINI_API_KEY` are also read from the environment, in memory only.

## 15. Simulation mode

- **Decision:** if the active provider's key is missing, or "Simulation mode" is turned on in Settings, that part runs simulated: the transcript plays a sample interview (English, Spanish or mixed) and answers are streamed sample texts. An orange "Simulated" badge is shown and every answer says so.
- **Why:** everything can be tried without keys, and the badge prevents mistaking simulated output for real output.

## 16. PDF resumes

- **Decision:** text is extracted locally with `unpdf` and stored in the settings. It can be edited by hand.
- **Alternative:** sending the PDF to Claude as a `document` block.
- **Why:** it works the same for Claude and Gemini, the text sits in the (cached) system prompt, and the user can fix anything that was extracted badly.

## 17. Prior art

- **Decision:** the design was informed by public documentation of similar tools and by the Electron docs. No code, name, text or images were copied from any other product. The icon is original, generated with a script.

## 18. OneDrive and node_modules

- **Problem:** the project originally lived in a OneDrive folder. `npm install` took 10+ minutes and sometimes hung, because OneDrive syncs every file in `node_modules` (there are thousands).
- **Fix:** the project was moved to `C:\dev\ChuletAI`, outside OneDrive. `npm ci` now takes about 24 s instead of about 13 min. Keep development checkouts out of synced folders.
- `node_modules`, `out`, `release` and `selftest-output` are in `.gitignore`.

## 19. Tests

- **Unit tests (Vitest):** prompt assembly, transcript merging, i18n, shortcuts, settings normalization, the Deepgram URL and messages, DNS fallback, PCM helpers and resume parsing (with a sample PDF).
- **Self-test in the real app (`npm run selftest`):** launches the built app with a temporary profile in simulation mode. It checks the Win32 styles, click-through with real mouse moves (`mouse_event`), private mode (window affinity and screen captures), encrypted keys, UI and Settings language switching, shortcuts with real key presses (`keybd_event`) and the full flow in English and Spanish. It also covers translate, analyze screen, audio capture (loopback and microphone without errors) and saving keys from the Settings window. Private mode is verified by counting ChuletAI's accent-green pixels in the window's region: about 8,400 without private mode and 0 with it. Comparing against a capture with the window hidden turned out to be unreliable, because hiding it changes which app is underneath. Screenshots go to `selftest-output/`.
- **Note:** the self-test moves the mouse and presses keys for about 40 seconds, so don't touch anything while it runs. Close any installed ChuletAI first, or the global shortcut checks will fail (the shortcuts are already taken).
- **Screenshots for the README:** `npm run screenshots` uses the same temporary profile in simulation mode and doesn't depend on global shortcuts.

## 20. Packaging

- **Decision:** an NSIS installer without code signing. Windows SmartScreen shows "Windows protected your PC" the first time (*More info* → *Run anyway*). There are no automatic updates.

## 21. Unstable networks: Opus audio, DNS fallback and reconnection

- **Problem seen in a real call:** transcription worked for a few seconds and then stopped for good, even after Stop/Start.
- **Diagnosis at the time:** name resolution for `api.deepgram.com` failed intermittently, and with the video call running the upload was saturated. Uncompressed PCM (256 kbps per channel) piled up and transcripts arrived 20–30 s late. (See #23: these measurements turned out to come from a restricted environment, not the user's network.)
- **Decisions:**
  - **WebM/Opus audio at 32 kbps via MediaRecorder**, about 8× less data. Every new connection needs the WebM header, so the main process announces each opened connection (`session`) and the renderer restarts the recorder.
  - **`RobustResolver`**: system DNS → public DNS → last known good IP. After a system failure it asks public DNS first for 10 minutes.
  - **Endless reconnection** (0.5 to 8 s backoff), except on 401/402/403. 20 s handshake timeout.
  - **Visible warnings** in the window: reconnecting, no audio, slow upload (more than 10 s of audio pending).
  - **Log at `%APPDATA%\ChuletAI\logs\chuletai.log`**, with no keys and no transcript text.
  - Capture restarts on its own if Windows ends a track (for example, when switching headphones), and the audio context resumes if it gets suspended.
  - **AI client reused** across requests, to avoid a new TLS connection each time.
- **Rejected alternative:** 8 kHz mulaw (64 kbps). It saves less than Opus and transcribes worse.
- **Verification:** `npm run selftest:live` uses the real keys and injects synthesized English speech as system audio, without using the speakers. Deepgram transcribed it and Claude answered in English and Spanish.

## 22. Saving keys in Settings

- **Problem reported:** "my API keys don't get saved".
- **Diagnosis:** interview fields in Settings saved as you typed, but key fields only saved with the "Save" button: pasting a key and pressing Enter, or closing the window, saved nothing. After saving, the field was left empty with no way to tell which key was stored.
- **Decision:** keys save on Enter, on the button or when leaving the field, like the rest of Settings. Settings shows "Key saved (encrypted) · ends in …1234", with only the last 4 characters, so the user can recognize the key without exposing it. The log records which keys were loaded at startup and every save or removal, without the value.
- **Verification:** the self-test types keys into the real Settings window (Enter and leaving the field), checks the hint, and checks they survive a restart.

## 23. Correction: some earlier failures came from the build environment

- **What actually happened:** the assistant that built the app ran its commands in a sandbox with **a virtualized view of `AppData\Roaming`** and restricted networking (DNS lookups for non-allowed domains fail). Every ChuletAI instance it launched inherited that sandbox:
  - Keys typed into those windows were saved in the sandbox's view, not in the real `%APPDATA%\ChuletAI`. When the app was opened from the desktop there was no `keys.json`, so it started in simulation mode.
  - **The DNS failures and 20–30 s delays in #21 were measured in processes launched from that sandbox**, so they most likely came from the sandbox, not the user's network. The #21 changes are kept because they cost nothing and make the app more resilient, but **it isn't proven that the user's network has those problems**.
- **Rule:** the app the user runs is installed and launched **through Windows Explorer**, never from inside a sandboxed shell. Self-tests can still run sandboxed because they use a temporary profile.
- **Also:** there is now a ✕ button on the overlay and "Quit ChuletAI" in Settings → General. Before, the app could only be closed from the tray icon, which Windows often hides.

## 24. Empty transcript in Meet: the default Windows microphone was muted

- **Symptom:** in a real Google Meet call the window said "Listening…" and no text ever appeared.
- **Diagnosis (from the real log):** the Deepgram WebSocket opened, audio arrived (KB > 0) and Deepgram answered with `Results`, but **all of them empty** (`withText=0`). The new level logging showed a peak of 0.000 on the microphone, and the track reported `muted=true`. The default Windows microphone ("Default – Microphone (USB Audio CODEC)") was muted at the system level. Meet was using a different one, the built-in "Microphone Array", which is why the user sounded fine in the call. Opus keeps sending bytes even for silence, so the KB counter didn't give it away.
- **Decision:** `openMicrophone` (in `audio.ts`) opens the default device. If it comes back muted, it tries the communications device and then all the others, and keeps the first one that isn't muted. If they're all muted, the microphone meter shows "Microphone is muted in Windows".
- **New logging** (never the transcript text): the list of microphones and which one is used, each track's state (`muted`, sample rate), peak level per channel every 15 s, Deepgram messages by type and how many carry text, and when the first text reaches the main process and the window.
- **Verification:** the real log showed `mic: using "Microphone Array (…)"`, `first transcript received` and `withText=5`, and the user saw text in the window.
- **Microphone picker:** *Settings → Transcription → Microphone*. The default is "System default", with the same automatic fallback. If the user picks one, its id and name are saved in `settings.json` (`micDeviceId`, `micLabel`); if the id changes, it's matched by name. If the chosen one is unplugged or muted in Windows, the app uses the default and, if needed, any other one that works, and logs it. Changing the microphone while listening restarts the session with the new one.
