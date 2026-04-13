# Frontend Walkthrough (HTML + CSS + JavaScript)

This document explains each frontend file and each major function in `script.js`, including how they interact.

---

## 1) `thai_scam_detector.html`

This HTML file is the source of truth for:

- which UI sections exist
- which elements have `id` values referenced by JavaScript
- which elements have `class` values referenced by CSS and JavaScript

### 1.1 Tabs

```html
<div class="tabs">
  <button id="textButton" class="tabButton" onclick="showSection('text')">...</button>
  <button id="liveButton" class="tabButton" onclick="showSection('live')">...</button>
  <button id="fileButton" class="tabButton" onclick="showSection('file')">...</button>
</div>
```

- `id="textButton"`, `id="liveButton"`, `id="fileButton"`
  - These IDs are used by `showSection(section)` by concatenating: `section + "Button"`.

- `class="tabButton"`
  - This class is used by:
    - CSS styling in `styles.css`
    - JS bulk-selection (`querySelectorAll`) to remove the `.active` class and to disable tabs while busy.

### 1.2 Sections

Each input method has a section `<div id="...Section">`:

- `id="textSection"`
- `id="liveSection"`
- `id="fileSection"`

These are shown/hidden by `showSection(section)` using:

- `document.getElementById(section + "Section")`

The result section is always shown (`resultSection`).

### 1.3 Text input section

Key elements:

- `id="textInput"`: `<textarea>` used to read the user’s text
- `id="btnAnalyzeText"`: analyze button, disabled when busy
- `id="textError"`: error box for text mode

### 1.4 Microphone section

Key elements:

- `id="micButton"`: mic button (start/stop)
- `id="mic-status"`: status text under mic button
- `id="liveTranscript"`: transcript display updated while speaking
- `id="micError"`: error box for mic mode

### 1.5 File upload section

Key elements:

- `id="dropZone"`: drag/drop zone
- `id="fileInput"`: hidden `<input type="file">`
- `id="dropZoneText"`: label that is updated to show selected file name
- `id="fileError"`: error box for file mode

### 1.6 Results + score

Key elements:

- Verdict box:
  - `id="verdictSection"`, `id="verdictIcon"`, `id="verdictLabel"`, `id="verdictSub"`
  - `id="scoreBadge"` shows numeric score

- Tokens:
  - `id="tokenDisplay"` is filled with `<span class="token">...</span>`

- Feature hits:
  - `id="hitOtp"`, `id="hitMoney"`, `id="hitUrgency"`, `id="hitAuthority"`

- Score bar:
  - `id="scoreBar"` has its width and color updated by JS

- Overall result errors:
  - `id="resultError"`

---

## 2) `styles.css`

The CSS file is grouped into major “UI modules”:

- Page base (background, fonts)
- Header
- Tabs
- Cards
- Buttons
- Mic section
- Drop zone
- Verdict box
- Tokens + feature chips
- Score bar
- Stats bar
- Error boxes

### 2.1 CSS classes vs IDs

- **Classes** are used when multiple elements share the style (e.g., `.card`, `.tabButton`).
- **IDs** are used for unique elements and often correlate with JavaScript references.

Examples:

- Tabs are styled via `.tabButton`.
- The verdict box is styled via `.verdict-box` and then themed via:
  - `.verdict-box.scam`
  - `.verdict-box.warning`
  - `.verdict-box.safe`

### 2.2 “Recording” state

Mic recording visuals rely on the JS adding/removing the `recording` class:

- CSS has `.mic-circle.recording { ... }`
- JS toggles `classList.add("recording")` / `classList.remove("recording")`

---

## 3) `script.js` — function-by-function

`script.js` owns the frontend behavior. The most important theme is: **UI → backend request → render backend response**.

### 3.1 `showSection(section)`

Purpose:

- Hide all input sections, then show the selected one.
- Update which tab button is visually “active”.

Key logic:

- Hides:
  - `textSection`, `liveSection`, `fileSection`
- Shows:
  - `resultSection` (always)
  - `section + "Section"`

Tab activation logic:

- Select all tab buttons:
  - `document.querySelectorAll(".tabButton")`
- Remove `.active` class from all
- Add `.active` to the selected button via:
  - `document.getElementById(section + "Button")`

Why renames can break this:

- If you rename `textButton` to `text-button`, `showSection('text')` will no longer find it.

### 3.2 Busy state: `setBusyState(busy)`

Purpose:

- Prevent double-submits / conflicting actions.
- Disable interactive controls while a backend request is in progress.

Controls affected:

- `btnAnalyzeText`
- `micButton`
- all `.tabButton` elements

### 3.3 Error helpers: `hideAllErrors()` and `showError(id, message)`

- `hideAllErrors()` clears and hides:
  - `textError`, `micError`, `fileError`, `resultError`

- `showError(id, message)` sets the `innerText` and shows the element.

This design keeps error display consistent across modes.

### 3.4 Backend JSON helper: `postJson(url, payload)`

Purpose:

- Send JSON to the backend and parse the response.
- Enforce that success responses are JSON.

Behavior:

- Always POSTs with `Content-Type: application/json`.
- Reads response as JSON if `content-type` includes `application/json`; otherwise reads text.
- If `!response.ok`, throws a descriptive `Error`.
- If response body is text on success, throws `Expected JSON but got text`.

### 3.5 Text analysis: `analyzeText()`

Purpose:

- Read text from `textInput`.
- Validate non-empty.
- Call backend `/analyze`.
- Render results.

Flow:

1. `hideAllErrors()`
2. read textarea value
3. if empty → `showError("textError", ...)`
4. `setBusyState(true)`
5. call `postJson("/analyze", { text })`
6. `renderAnalysisResult(data)`
7. `finally { setBusyState(false) }`

### 3.6 Live mic: `toggleMic()`

Purpose:

- Start/stop Web Speech API recognition.
- When recognition ends, send transcript text to backend `/analyze`.

Key concepts:

- `recognition` holds the SpeechRecognition instance.
- `isRecording` tracks whether recognition is running.
- `isBusy` blocks starting recognition while a request is in progress.

Handlers:

- `recognition.onresult`
  - builds a transcript from `event.results`
  - writes it to `#liveTranscript`

- `recognition.onerror`
  - stops recording state
  - removes `.recording` CSS class from mic button
  - displays error in `micError`
  - The common error string `no-speech` comes from `event.error`.

- `recognition.onend`
  - reads final transcript from `#liveTranscript`
  - if empty/placeholder → return
  - calls `/analyze` with `{ text: transcript }`

Start logic:

- `recognition.start()`
- sets UI status
- adds `recording` class to the mic button to trigger CSS animation

### 3.7 File upload: `setupFileUpload()` and `handleAudioFile(file)`

#### `setupFileUpload()`

Purpose:

- Connect drag/drop and file chooser to `handleAudioFile()`.

Events:

- `dragover` / `dragleave` / `drop` on `dropZone`
- `change` on `fileInput`

#### `handleAudioFile(file)`

Purpose:

- Validate file type/extension
- Upload to `/transcribe`
- Render immediately if backend returns analysis
- Otherwise call `/analyze` with transcript

Key details:

- Upload is `multipart/form-data` via `FormData`:
  - `formData.append("file", file)`

Response handling:

- If response is not JSON, throw an error including the returned text.
- If JSON has `tokens`, treat it as analysis and render.
- Else if JSON has `transcript`, call `/analyze` and render the returned analysis.

### 3.8 Normalization: `normalizeHits(hits)`

Purpose:

Make the renderer tolerant to backend variations.

For each key `otp`, `money`, `urgency`, `authority`, it returns an array of strings:

- array → mapped to strings
- true → `["(match)"]`
- false/null/undefined → `[]`
- string → `[string]`
- object → `Object.keys(object)`

### 3.9 Render adapter: `renderAnalysisResult(data)`

Purpose:

- Single entry point to parse backend JSON and call the UI renderer.

Responsibilities:

- Validate `data` is an object
- Extract:
  - `tokens` (array)
  - `hits` (normalized)
  - `score` (number)
  - `verdict` (normalized object)

Then calls:

- `displayResults(tokens, hits, score, verdict)`

Verdict normalization:

- The code calls `parseVerdict(data)`.
- It supports verdict fields being either:
  - top-level on the response object
  - or nested under `data.verdict`

### 3.10 UI renderer: `displayResults(tokens, hits, score, verdict)`

Purpose:

- Update verdict box theme
- Show score badge
- Render tokens
- Render hit chips
- Update score bar width/color
- Scroll to results
- Update stats counters

Key rule:

- It does **not** classify based on score; it uses backend verdict fields.

Current behavior:

- SCAM if `verdict.is_scam` is true
- WARNING if `verdict.isWarning` is true
- SAFE otherwise

Token display performance:

- Token chips are capped at 50 items in the UI (with a `+X more` chip).

### 3.11 Hit chip renderer: `renderHitChips(elementId, matches)`

Purpose:

- Display `-` when there are no matches.
- Otherwise create `<span class="feature-chip">...</span>` chips.

### 3.12 Stats: `updateStats(is_scam)`

Purpose:

- Keep simple client-side counters.
- Update DOM elements:
  - `stat-analyzed`, `stat-scam`, `stat-safe`, `stat-rate`

### 3.13 Boot: `window.addEventListener("load", ...)`

Purpose:

- Ensure event handlers are attached after DOM loads.
- Calls:
  - `setupFileUpload()`
  - `showSection("text")`

---

## Renaming checklist (practical)

If you rename any `id` or `class`, search all three files:

- `thai_scam_detector.html`
- `styles.css`
- `script.js`

Additionally, watch for dynamic IDs in `showSection()`:

- `section + "Button"`
- `section + "Section"`

Those create implicit naming contracts.
