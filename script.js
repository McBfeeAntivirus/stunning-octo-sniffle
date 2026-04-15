// ------------------------------------------------------------
// Tab switching (Input method selection)
// ------------------------------------------------------------
function showSection(section) {
  document.getElementById("textSection").style.display = "none";
  document.getElementById("liveSection").style.display = "none";
  document.getElementById("fileSection").style.display = "none";
  document.getElementById("resultSection").style.display = "block";
  document.getElementById(section + "Section").style.display = "block";

  var buttons = document.querySelectorAll(".tabButton");
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.remove("active");
  }

  var sectionButton = document.getElementById(section + "Button");
  if (sectionButton) sectionButton.classList.add("active");
}

// Backend base URL (the Node/Express backend defaults to http://localhost:5000)
var API_BASE_URL =
  (typeof window !== "undefined" && window.API_BASE_URL) ||
  (typeof localStorage !== "undefined" && localStorage.getItem("API_BASE_URL")) ||
  "http://localhost:5000";

// ------------------------------------------------------------
// UI state (disable controls while requesting/processing)
// ------------------------------------------------------------
var isBusy = false;
var recognition = null;
var isRecording = false;
var stats = { analyzed: 0, scam: 0, warning: 0, safe: 0 };
var els = null;

var EXAMPLES = [
  "กรุณาบอกรหัส OTP ตอนนี้เพื่อยืนยันบัญชี",
  "คุณต้องโอนเงิน 50000 บาทภายใน 10 นาทีไม่งั้นบัญชีถูกระงับ",
  "นี่คือตำรวจไซเบอร์ คุณต้องให้ข้อมูลบัญชีธนาคารด่วนมาก",
  "ธนาคารกสิกรไทยแจ้งว่าบัญชีของคุณถูกระงับ กรุณายืนยัน PIN ทันที",
  "วันนี้ไปกินข้าวกันไหม",
  "สวัสดีครับ คุณสะดวกคุยตอนบ่ายสามได้ไหมครับ"
];

function setExample(i) {
  var e = getEls();
  if (!e.textInput) return;
  e.textInput.value = EXAMPLES[i] || "";
  showSection("text");
}

// Cache DOM elements used frequently during rendering, for optimization.
function getEls() {
  if (els) return els;
  els = {
    textSection: document.getElementById("textSection"),
    liveSection: document.getElementById("liveSection"),
    fileSection: document.getElementById("fileSection"),
    resultSection: document.getElementById("resultSection"),
    textInput: document.getElementById("textInput"),
    btnAnalyzeText: document.getElementById("btnAnalyzeText"),
    micButton: document.getElementById("micButton"),
    micStatus: document.getElementById("mic-status"),
    liveTranscript: document.getElementById("liveTranscript"),
    dropZoneText: document.getElementById("dropZoneText"),
    verdictSection: document.getElementById("verdictSection"),
    verdictLabel: document.getElementById("verdictLabel"),
    verdictSub: document.getElementById("verdictSub"),
    verdictIcon: document.getElementById("verdictIcon"),
    scoreBadge: document.getElementById("scoreBadge"),
    tokenDisplay: document.getElementById("tokenDisplay"),
    hitOtp: document.getElementById("hitOtp"),
    hitMoney: document.getElementById("hitMoney"),
    hitUrgency: document.getElementById("hitUrgency"),
    hitAuthority: document.getElementById("hitAuthority"),
    scoreBar: document.getElementById("scoreBar"),
    statAnalyzed: document.getElementById("stat-analyzed"),
    statScam: document.getElementById("stat-scam"),
    statWarning: document.getElementById("stat-warning"),
    statSafe: document.getElementById("stat-safe"),
    statRate: document.getElementById("stat-rate")
  };
  return els;
}

function actPL(step) {
  for (var i = 1; i <= 6; i++) {
    var el = document.getElementById("ps-" + i);
    if (!el) continue;
    el.className = "pipe-step" + (i < step ? " done" : i === step ? " active" : "");
  }
}

function resetPL() {
  for (var i = 1; i <= 6; i++) {
    var el = document.getElementById("ps-" + i);
    if (el) el.className = "pipe-step";
  }
}

function setPipelineResultClass(is_scam, is_warning) {
  var el = document.getElementById("ps-6");
  if (!el) return;
  if (is_scam) el.className = "pipe-step result-scam";
  else if (is_warning) el.className = "pipe-step result-warning";
  else el.className = "pipe-step result-ok";
}

function setBusyState(busy) {
  isBusy = busy;
  var e = getEls();
  var analyzeBtn = e.btnAnalyzeText;
  if (analyzeBtn) analyzeBtn.disabled = busy;
  var micButton = e.micButton;
  if (micButton) micButton.disabled = busy;
  var tabBtns = document.querySelectorAll(".tabButton");
  for (var i = 0; i < tabBtns.length; i++) {
    tabBtns[i].disabled = busy;
  }
}

function hideAllErrors() {
  var ids = ["textError", "micError", "fileError", "resultError"];
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (el) {
      el.style.display = "none";
      el.innerText = "";
    }
  }
}

function showError(id, message) {
  var el = document.getElementById(id);
  if (!el) return;
  el.innerText = message;
  el.style.display = "block";
}

// ------------------------------------------------------------
// POST JSON helper (backend API)
// ------------------------------------------------------------
async function postJson(url, payload) {
  var response = await fetch(API_BASE_URL + url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  var contentType = response.headers.get("content-type") || "";
  var body;
  if (contentType.indexOf("application/json") !== -1) {
    body = await response.json();
  } else {
    body = await response.text();
  }

  if (!response.ok) {
    var msg = "Request failed (" + response.status + ")";
    if (typeof body === "string" && body) msg += "\n" + body;
    if (body && typeof body === "object") msg += "\n" + JSON.stringify(body);
    throw new Error(msg);
  }

  if (typeof body === "string") {
    throw new Error("Expected JSON but got text:\n" + body);
  }
  return body;
}

// ------------------------------------------------------------
// Text input -> POST /analyze
// ------------------------------------------------------------
async function analyzeText() {
  hideAllErrors();
  var e = getEls();
  var text = ((e.textInput && e.textInput.value) || "").trim();

  if (!text) {
    showError("textError", "กรุณาพิมพ์ข้อความก่อน");
    return;
  }

  setBusyState(true);
  resetPL();
  actPL(4);
  try {
    var data = await postJson("/analyze", { text: text, source: "text-input" });
    renderAnalysisResult(data);
    fetchAndRenderDataset();
  } catch (e) {
    showError("textError", (e && e.message ? e.message : String(e)));
  } finally {
    setBusyState(false);
  }
}

// ------------------------------------------------------------
// Live microphone (Web Speech API) -> transcript -> POST /analyze
// ------------------------------------------------------------
function toggleMic() {
  hideAllErrors();

  if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
    showError("micError", "เบราว์เซอร์นี้ไม่รองรับ Web Speech API\nกรุณาใช้ Chrome หรือ Edge");
    return;
  }

  if (isBusy) return;

  if (isRecording && recognition) {
    recognition.stop();
    return;
  }

  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = "th-TH";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = function(event) {
    var transcript = "";
    for (var i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    var e = getEls();
    if (e.liveTranscript) e.liveTranscript.innerText = transcript;
  };

  recognition.onerror = function(event) {
    isRecording = false;
    var e = getEls();
    var micButton = e.micButton;
    if (micButton) micButton.classList.remove("recording");
    if (e.micStatus) e.micStatus.innerText = "กดปุ่มเพื่อเริ่มอัดเสียง";
    showError("micError", (event && event.error ? event.error : "unknown"));
  };

  recognition.onend = async function() {
    isRecording = false;
    var e = getEls();
    var micButton = e.micButton;
    if (micButton) micButton.classList.remove("recording");
    if (e.micStatus) e.micStatus.innerText = "กดปุ่มเพื่อเริ่มอัดเสียง";

    var text = ((e.liveTranscript && e.liveTranscript.innerText) || "").trim();
    if (!text || text === "รอเสียง...") return;

    setBusyState(true);
    resetPL();
    actPL(4);
    try {
      var data = await postJson("/analyze", { text: text, source: "webspeech" });
      renderAnalysisResult(data);
      fetchAndRenderDataset();
    } catch (e) {
      showError("micError", (e && e.message ? e.message : String(e)));
    } finally {
      setBusyState(false);
    }
  };

  try {
    recognition.start();
    isRecording = true;
    var e = getEls();
    if (e.liveTranscript) e.liveTranscript.innerText = "รอเสียง...";
    if (e.micStatus) e.micStatus.innerText = "กำลังฟัง... (กดอีกครั้งเพื่อหยุด)";
    var micButton2 = e.micButton;
    if (micButton2) micButton2.classList.add("recording");
  } catch (e) {
    showError("micError", (e && e.message ? e.message : String(e)));
  }
}

// ------------------------------------------------------------
// Audio file upload -> POST /transcribe -> (maybe) POST /analyze
// ------------------------------------------------------------
function setupFileUpload() {
  var dropZone = document.getElementById("dropZone");
  var fileInput = document.getElementById("fileInput");
  if (!dropZone || !fileInput) return;

  dropZone.addEventListener("dragover", function(e) {
    e.preventDefault();
    dropZone.classList.add("drag-hover");
  });

  dropZone.addEventListener("dragleave", function() {
    dropZone.classList.remove("drag-hover");
  });

  dropZone.addEventListener("drop", function(e) {
    e.preventDefault();
    dropZone.classList.remove("drag-hover");
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files[0]) return;
    handleAudioFile(e.dataTransfer.files[0]);
  });

  fileInput.addEventListener("change", function() {
    if (!fileInput.files || !fileInput.files[0]) return;
    handleAudioFile(fileInput.files[0]);
  });
}

async function handleAudioFile(file) {
  hideAllErrors();
  if (!file) return;

  var allowed = ["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/m4a"];
  var name = (file.name || "").toLowerCase();
  var okExt = name.endsWith(".wav") || name.endsWith(".mp3") || name.endsWith(".ogg") || name.endsWith(".m4a");
  var okType = !file.type || allowed.indexOf(file.type) !== -1;
  if (!okExt && !okType) {
    showError("fileError", "ไฟล์ไม่รองรับ: " + file.name);
    return;
  }

  var e = getEls();
  var dzText = e.dropZoneText;
  if (dzText) dzText.innerText = "📄 " + file.name;

  setBusyState(true);
  resetPL();
  actPL(1);
  try {
    var formData = new FormData();
    formData.append("audio", file);
    var response = await fetch(API_BASE_URL + "/transcribe", { method: "POST", body: formData });

    var contentType = response.headers.get("content-type") || "";
    var data;
    if (contentType.indexOf("application/json") !== -1) {
      data = await response.json();
    } else {
      var text = await response.text();
      throw new Error("Expected JSON but got text:\n" + text);
    }

    if (!response.ok) {
      throw new Error("Request failed (" + response.status + ")\n" + JSON.stringify(data));
    }

    if (data && typeof data === "object" && data.tokens) {
      renderAnalysisResult(data);
      fetchAndRenderDataset();
    } else if (data && typeof data === "object" && data.transcript) {
      var analyzed = await postJson("/analyze", { text: data.transcript, source: "upload" });
      renderAnalysisResult(analyzed);
      fetchAndRenderDataset();
    } else {
      throw new Error("Unexpected /transcribe response: " + JSON.stringify(data));
    }
  } catch (e) {
    showError("fileError", (e && e.message ? e.message : String(e)));
  } finally {
    setBusyState(false);
  }
}

// ------------------------------------------------------------
// Normalize backend `hits` shape for rendering
// ------------------------------------------------------------
function normalizeHits(hits) {
  var h = hits || {};

  function getMatchesArray(key) {
    if (Array.isArray(h[key])) return h[key].map(String);
    if (h[key] === true) return ["(match)"];
    if (h[key] === false || h[key] == null) return [];
    if (typeof h[key] === "string") return [h[key]];
    if (typeof h[key] === "object") return Object.keys(h[key]);
    return [];
  }

  return {
    otp: getMatchesArray("otp"),
    money: getMatchesArray("money"),
    urgency: getMatchesArray("urgency"),
    authority: getMatchesArray("authority")
  };
}

// ------------------------------------------------------------
// Parse `/analyze` response then render
// ------------------------------------------------------------
function renderAnalysisResult(data) {
  hideAllErrors();
  if (!data || typeof data !== "object") {
    showError("resultError", "Invalid response from backend");
    return;
  }

  var tokens = Array.isArray(data.tokens) ? data.tokens : [];
  var hits = normalizeHits(data.hits);
  var score = typeof data.score === "number" ? data.score : Number(data.score);
  if (isNaN(score)) score = 0;
  var verdict = parseVerdict(data);

  resetPL();
  actPL(6);
  setPipelineResultClass(Boolean(verdict && verdict.is_scam), Boolean(verdict && verdict.isWarning));

  displayResults(tokens, hits, score, verdict);
}

function parseVerdict(data) {
  if (!data || typeof data !== "object") {
    return { is_scam: false, isWarning: false, label: "normal" };
  }

  var isScam = Boolean(data.is_scam);
  var isWarning = Boolean(data.is_warning);
  var label = typeof data.label === "string" ? data.label : "normal";

  return { is_scam: isScam, isWarning: isWarning, label: label };
}

// ------------------------------------------------------------
// Display_Results() (render UI only; no scoring/classification)
// ------------------------------------------------------------
function displayResults(tokens, hits, score, verdict) {
  var e = getEls();
  if (e.resultSection) e.resultSection.style.display = "block";

  var verdictBox = e.verdictSection;
  var verdictLabel = e.verdictLabel;
  var verdictSub = e.verdictSub;
  var verdictIcon = e.verdictIcon;

  var verdictLabelValue = verdict && typeof verdict.label === "string" ? verdict.label : "";
  if (verdictLabelValue === "scam" || (verdict && verdict.is_scam)) {
    if (verdictBox) verdictBox.className = "verdict-box scam";
    if (verdictIcon) verdictIcon.innerText = "🚨";
    if (verdictLabel) verdictLabel.innerText = "SCAM DETECTED - ตรวจพบการหลอกลวง";
    if (verdictSub) verdictSub.innerText = "";
  } else if (verdictLabelValue === "warning" || (verdict && verdict.isWarning)) {
    if (verdictBox) verdictBox.className = "verdict-box warning";
    if (verdictIcon) verdictIcon.innerText = "⚠️";
    if (verdictLabel) verdictLabel.innerText = "WARNING - ระวัง";
    if (verdictSub) verdictSub.innerText = "";
  } else {
    if (verdictBox) verdictBox.className = "verdict-box safe";
    if (verdictIcon) verdictIcon.innerText = "✅";
    if (verdictLabel) verdictLabel.innerText = "SAFE - ปลอดภัย";
    if (verdictSub) verdictSub.innerText = "";
  }

  var scoreBadge = e.scoreBadge;
  if (scoreBadge) {
    scoreBadge.innerText = score + "/100";
    scoreBadge.style.display = "block";
  }

  renderTokens(tokens, hits);

  renderHitChips("hitOtp", hits.otp);
  renderHitChips("hitMoney", hits.money);
  renderHitChips("hitUrgency", hits.urgency);
  renderHitChips("hitAuthority", hits.authority);

  var bar = e.scoreBar;
  if (bar) {
    bar.style.width = Math.max(0, Math.min(100, score)) + "%";
    if (verdict && verdict.is_scam) {
      bar.style.backgroundColor = "#e74c3c";
    } else if (verdict && verdict.isWarning) {
      bar.style.backgroundColor = "#f1c40f";
    } else {
      bar.style.backgroundColor = "#2ecc71";
    }
  }

  updateStats(Boolean(verdict && verdict.is_scam), Boolean(verdict && verdict.isWarning));
}

function renderTokens(tokens, hits) {
  var e = getEls();
  var tokenDisplay = e.tokenDisplay;
  if (!tokenDisplay) return;

  tokenDisplay.innerHTML = "";
  if (!tokens || tokens.length === 0) {
    tokenDisplay.innerText = "รอข้อความ...";
    return;
  }

  var h = normalizeHits(hits);
  var tokenToCat = {};
  var catKeys = ["otp", "money", "urgency", "authority"];
  for (var c = 0; c < catKeys.length; c++) {
    var k = catKeys[c];
    var arr = h && h[k] ? h[k] : [];
    for (var j = 0; j < arr.length; j++) {
      tokenToCat[String(arr[j])] = k;
    }
  }

  var maxTokens = 50;
  var count = Math.min(tokens.length, maxTokens);
  var frag = document.createDocumentFragment();
  for (var i = 0; i < count; i++) {
    var span = document.createElement("span");
    span.className = "token";
    var t = String(tokens[i]);
    span.innerText = t;
    var cat = tokenToCat[t];
    if (cat === "otp") span.classList.add("hit-otp");
    else if (cat === "money") span.classList.add("hit-money");
    else if (cat === "urgency") span.classList.add("hit-urgency");
    else if (cat === "authority") span.classList.add("hit-authority");
    frag.appendChild(span);
  }

  if (tokens.length > maxTokens) {
    var more = document.createElement("span");
    more.className = "token";
    more.innerText = "+" + (tokens.length - maxTokens) + " more";
    frag.appendChild(more);
  }
  tokenDisplay.appendChild(frag);
}

function renderHitChips(elementId, matches) {
  var el = document.getElementById(elementId);
  if (!el) return;

  var arr = Array.isArray(matches) ? matches : [];
  el.innerHTML = "";

  if (arr.length === 0) {
    el.innerText = "-";
    el.className = "hit-badge";
    return;
  }

  el.className = "hit-badge chips";
  for (var i = 0; i < arr.length; i++) {
    var chip = document.createElement("span");
    chip.className = "feature-chip";
    chip.innerText = String(arr[i]);
    el.appendChild(chip);
  }
}

function updateStats(is_scam, is_warning) {
  stats.analyzed++;
  if (is_scam) stats.scam++;
  else if (is_warning) stats.warning++;
  else stats.safe++;

  var e = getEls();
  if (e.statAnalyzed) e.statAnalyzed.innerText = stats.analyzed;
  if (e.statScam) e.statScam.innerText = stats.scam;
  if (e.statWarning) e.statWarning.innerText = stats.warning;
  if (e.statSafe) e.statSafe.innerText = stats.safe;

  var rate = stats.analyzed > 0 ? Math.round((stats.scam / stats.analyzed) * 100) + "%" : "-";
  if (e.statRate) e.statRate.innerText = rate;
}

async function fetchAndRenderDataset() {
  var tbody = document.getElementById("csv-body");
  if (!tbody) return;
  try {
    var res = await fetch(API_BASE_URL + "/dataset");
    var data = await res.json();
    if (data && typeof data === "object" && Array.isArray(data.rows)) {
      renderDatasetTable(data.rows);
    } else if (Array.isArray(data)) {
      renderDatasetTable(data);
    } else {
      renderDatasetTable([]);
    }
  } catch (e) {
    renderDatasetTable([]);
  }
}

async function resetBackendDatasetOnLoad() {
  try {
    await fetch(API_BASE_URL + "/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
  } catch (e) {
    // ignore
  }
}

function renderDatasetTable(rows) {
  var tbody = document.getElementById("csv-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!Array.isArray(rows) || rows.length === 0) {
    var tr0 = document.createElement("tr");
    var td0 = document.createElement("td");
    td0.colSpan = 6;
    td0.className = "dataset-empty";
    td0.innerText = "ยังไม่มีข้อมูล";
    tr0.appendChild(td0);
    tbody.appendChild(tr0);
    return;
  }

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i] || {};
    var tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + escapeHtml(String(r.id == null ? "" : r.id)) + "</td>" +
      "<td>" + escapeHtml(String(r.transcript == null ? "" : r.transcript)) + "</td>" +
      "<td>" + escapeHtml(String(r.label == null ? "" : r.label)) + "</td>" +
      "<td>" + escapeHtml(String(r.score == null ? "" : r.score)) + "</td>" +
      "<td>" + escapeHtml(String(r.source == null ? "" : r.source)) + "</td>" +
      "<td>" + escapeHtml(String(r.hits == null ? "" : r.hits)) + "</td>";
    tbody.appendChild(tr);
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function exportCSV() {
  window.open(API_BASE_URL + "/export", "_blank");
}

window.addEventListener("load", function() {
  getEls();
  setupFileUpload();
  resetBackendDatasetOnLoad().then(fetchAndRenderDataset);
  resetPL();
  showSection("text");
});