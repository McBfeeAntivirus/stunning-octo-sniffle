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

// ------------------------------------------------------------
// UI state (disable controls while requesting/processing)
// ------------------------------------------------------------
var isBusy = false;
var recognition = null;
var isRecording = false;
var stats = { analyzed: 0, scam: 0, safe: 0 };
var els = null;

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
    statSafe: document.getElementById("stat-safe"),
    statRate: document.getElementById("stat-rate")
  };
  return els;
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
// POST JSON helper (same-origin backend)
// ------------------------------------------------------------
async function postJson(url, payload) {
  var response = await fetch(url, {
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
  try {
    var data = await postJson("/analyze", { text: text });
    renderAnalysisResult(data);
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
    try {
      var data = await postJson("/analyze", { text: text });
      renderAnalysisResult(data);
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
  try {
    var formData = new FormData();
    formData.append("file", file);
    var response = await fetch("/transcribe", { method: "POST", body: formData });

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
    } else if (data && typeof data === "object" && data.transcript) {
      var analyzed = await postJson("/analyze", { text: data.transcript });
      renderAnalysisResult(analyzed);
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

  displayResults(tokens, hits, score, verdict);
}

function parseVerdict(data) {
  // Backend may return verdict fields either top-level or nested under `data.verdict`.
  var v = (data && typeof data.verdict === "object" && data.verdict) ? data.verdict : data;

  var hasIsScam = v && Object.prototype.hasOwnProperty.call(v, "isScam");
  var hasIsScamSnake = v && Object.prototype.hasOwnProperty.call(v, "is_scam");
  var isScam = false;
  if (hasIsScam) isScam = Boolean(v.isScam);
  else if (hasIsScamSnake) isScam = Boolean(v.is_scam);

  var isWarning = false;
  if (v && Object.prototype.hasOwnProperty.call(v, "isWarning")) {
    isWarning = Boolean(v.isWarning);
  }

  var label = (v && typeof v.label === "string") ? v.label : "";

  if (!label) {
    if (isScam) label = "scam";
    else if (isWarning) label = "warning";
    else label = "normal";
  }

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

  renderTokens(tokens);

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

  if (e.resultSection) e.resultSection.scrollIntoView({ behavior: "smooth" });
  updateStats(Boolean(verdict && verdict.is_scam));
}

function renderTokens(tokens) {
  var e = getEls();
  var tokenDisplay = e.tokenDisplay;
  if (!tokenDisplay) return;

  tokenDisplay.innerHTML = "";
  if (!tokens || tokens.length === 0) {
    tokenDisplay.innerText = "-";
    return;
  }

  var maxTokens = 50;
  var count = Math.min(tokens.length, maxTokens);
  var frag = document.createDocumentFragment();
  for (var i = 0; i < count; i++) {
    var span = document.createElement("span");
    span.className = "token";
    span.innerText = String(tokens[i]);
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

function updateStats(is_scam) {
  stats.analyzed++;
  if (is_scam) stats.scam++;
  else stats.safe++;

  var e = getEls();
  if (e.statAnalyzed) e.statAnalyzed.innerText = stats.analyzed;
  if (e.statScam) e.statScam.innerText = stats.scam;
  if (e.statSafe) e.statSafe.innerText = stats.safe;

  var rate = stats.analyzed > 0 ? Math.round((stats.scam / stats.analyzed) * 100) + "%" : "-";
  if (e.statRate) e.statRate.innerText = rate;
}

window.addEventListener("load", function() {
  getEls();
  setupFileUpload();
  showSection("text");
});