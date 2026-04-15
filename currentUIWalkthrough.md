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

### 1.1.1 Pipeline bar (UI-only)

Above the tabs, the page includes a 6-step “pipeline” bar:

- Step elements use IDs: `ps-1` … `ps-6`
- JavaScript toggles CSS classes (`active`, `done`, `result-scam`, `result-warning`, `result-ok`) to create a simple progress / status effect.

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

Additional elements:

- Example buttons row ("ตัวอย่าง:")
  - Each button calls `setExample(i)` to quickly populate the textarea with a pre-defined sample.

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
  - Tokens may receive extra classes for highlighting:
    - `hit-otp`, `hit-money`, `hit-urgency`, `hit-authority`

- Feature hits:
  - `id="hitOtp"`, `id="hitMoney"`, `id="hitUrgency"`, `id="hitAuthority"`

- Score bar:
  - `id="scoreBar"` has its width and color updated by JS

- Overall result errors:
  - `id="resultError"`

### 1.7 Dataset preview + Export CSV

At the bottom of the page there is a dataset preview table used for demo/debugging:

- `id="csv-body"` is the `<tbody>` that JS populates with rows from backend `GET /dataset`.
- The Export button calls `exportCSV()` which opens backend `GET /export`.

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

### 3.2.1 Example messages: `EXAMPLES` and `setExample(i)`

Purpose:

- Provide quick demo/test inputs under the text textarea.

Behavior:

- `EXAMPLES` is an array of sample Thai messages.
- `setExample(i)` sets `#textInput.value` to the sample and switches the UI back to the Text tab.

This is UI-only; it does not call the backend by itself.

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
- Uses `API_BASE_URL` and calls `fetch(API_BASE_URL + url, ...)`.
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
5. call `postJson("/analyze", { text, source: "text-input" })`
6. `renderAnalysisResult(data)`
7. refresh dataset preview via `fetchAndRenderDataset()`
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
  - calls `/analyze` with `{ text: transcript, source: "webspeech" }`

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
  - `formData.append("audio", file)`

Response handling:

- If response is not JSON, throw an error including the returned text.
- If JSON has `tokens`, treat it as analysis and render.
- Else if JSON has `transcript`, call `/analyze` and render the returned analysis.

After rendering, the frontend refreshes the dataset preview via `fetchAndRenderDataset()`.

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

It also updates the pipeline bar UI state:

- Resets pipeline classes
- Marks step 6 active
- Applies a result class on step 6 based on backend verdict

Verdict normalization:

- The code calls `parseVerdict(data)`.
- It reads verdict fields from the top-level backend response:
  - `is_scam`
  - `is_warning`
  - `label`

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
- WARNING if `verdict.isWarning` is true (derived from backend `is_warning`)
- SAFE otherwise

Token display performance:

- Token chips are capped at 50 items in the UI (with a `+X more` chip).

Token highlighting:

- Tokens are rendered by `renderTokens(tokens, hits)`.
- It uses `hits` to assign token highlight classes (`hit-otp`, `hit-money`, `hit-urgency`, `hit-authority`) so the token chips visually match the detected feature categories.

### 3.10.1 Token renderer: `renderTokens(tokens, hits)`

Purpose:

- Show token chips in `#tokenDisplay`.
- Apply hit-based highlight classes when possible.
- Keep the UI fast by limiting rendered chips to 50.

High-level logic:

- If there are no tokens, show placeholder text (`รอข้อความ...`).
- Build a `tokenToCat` lookup using `hits` (token string → category).
- Render token chips and add `hit-*` classes when a token is present in the lookup.

### 3.11 Hit chip renderer: `renderHitChips(elementId, matches)`

Purpose:

- Display `-` when there are no matches.
- Otherwise create `<span class="feature-chip">...</span>` chips.

### 3.12 Stats: `updateStats(is_scam)`

Purpose:

- Keep simple client-side counters.
- Update DOM elements:
  - `stat-analyzed`, `stat-scam`, `stat-warning`, `stat-safe`, `stat-rate`

Current signature:

- `updateStats(is_scam, is_warning)`

Behavior:

- Increments scam counter when `is_scam` is true
- Otherwise increments warning counter when `is_warning` is true
- Otherwise increments safe counter

### 3.12.1 Dataset preview: `fetchAndRenderDataset()`, `renderDatasetTable(rows)`, `exportCSV()`

Purpose:

- Keep the Dataset (CSV Preview) table in sync with backend `GET /dataset`.

Behavior:

- `fetchAndRenderDataset()` fetches JSON rows from `API_BASE_URL + "/dataset"` and renders them.
- `renderDatasetTable(rows)` populates `#csv-body` with table rows (or an empty state).
- `exportCSV()` opens `API_BASE_URL + "/export"` in a new tab/window to download CSV.

### 3.13 Boot: `window.addEventListener("load", ...)`

Purpose:

- Ensure event handlers are attached after DOM loads.
- Calls:
  - `setupFileUpload()`
  - `showSection("text")`

---