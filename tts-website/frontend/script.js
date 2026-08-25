// Point this at your backend's URL (local dev or your deployed Render/Railway URL)
const API_BASE = 'https://tts-backend-33xv.onrender.com';

const textInput = document.getElementById("text-input");
const fileInput = document.getElementById("file-input");
const fileNameLabel = document.getElementById("file-name");
const fileDrop = document.getElementById("file-drop");
const languageSelect = document.getElementById("language-select");
const voiceSelect = document.getElementById("voice-select");
const rateSelect = document.getElementById("rate-select");
const generateBtn = document.getElementById("generate-btn");
const btnLabel = generateBtn.querySelector(".btn-label");
const btnSpinner = document.getElementById("btn-spinner");
const statusEl = document.getElementById("status");
const playerWrap = document.getElementById("player-wrap");
const audioPlayer = document.getElementById("audio-player");
const downloadLink = document.getElementById("download-link");
const charCount = document.getElementById("char-count");
const tabIndicator = document.getElementById("tab-indicator");
const tabButtons = document.querySelectorAll(".tab-btn");
const targetTimeInput = document.getElementById("target-time-input");
const autoSpeedBtn = document.getElementById("auto-speed-btn");

let autoSpeedOn = false;
let allVoices = [];
let activeTab = "text-tab";

// ---- Auto Speed toggle ----
autoSpeedBtn.addEventListener("click", () => {
  autoSpeedOn = !autoSpeedOn;
  autoSpeedBtn.classList.toggle("active", autoSpeedOn);
  rateSelect.disabled = autoSpeedOn;

  if (autoSpeedOn) {
    targetTimeInput.focus();
  }
});

// ---- Tabs (with sliding indicator) ----
function moveIndicatorTo(btn) {
  const index = Array.from(tabButtons).indexOf(btn);
  tabIndicator.style.transform = `translateX(${index * 100}%)`;
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
    activeTab = btn.dataset.tab;
    moveIndicatorTo(btn);
  });
});

// ---- Character counter ----
textInput.addEventListener("input", () => {
  charCount.textContent = textInput.value.length;
});

// ---- File input + drag & drop ----
function updateFileLabel(file) {
  fileNameLabel.innerHTML = file
    ? file.name
    : 'Drop a file here, or <u>click to browse</u>';
}

fileInput.addEventListener("change", () => {
  updateFileLabel(fileInput.files.length ? fileInput.files[0] : null);
});

["dragenter", "dragover"].forEach((evt) => {
  fileDrop.addEventListener(evt, (e) => {
    e.preventDefault();
    fileDrop.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((evt) => {
  fileDrop.addEventListener(evt, (e) => {
    e.preventDefault();
    fileDrop.classList.remove("drag-over");
  });
});

fileDrop.addEventListener("drop", (e) => {
  const dropped = e.dataTransfer.files;
  if (dropped.length) {
    fileInput.files = dropped;
    updateFileLabel(dropped[0]);
  }
});

// ---- Load voices from backend and populate dropdowns ----
async function loadVoices() {
  try {
    const res = await fetch(`${API_BASE}/voices`);
    if (!res.ok) throw new Error("Failed to fetch voices");
    allVoices = await res.json();

    const languages = [...new Set(allVoices.map((v) => v.locale))].sort();
    languageSelect.innerHTML = languages
      .map((loc) => `<option value="${loc}">${loc}</option>`)
      .join("");

    if (languages.length) {
      populateVoicesForLanguage(languages[0]);
    }
  } catch (err) {
    statusEl.textContent = "Could not load voice list. Is the backend running?";
    statusEl.classList.add("error");
  }
}

function populateVoicesForLanguage(locale) {
  const voicesForLang = allVoices.filter((v) => v.locale === locale);
  voiceSelect.innerHTML = voicesForLang
    .map((v) => `<option value="${v.name}">${v.friendly_name} (${v.gender})</option>`)
    .join("");
}

languageSelect.addEventListener("change", () => {
  populateVoicesForLanguage(languageSelect.value);
});

// ---- Generate audio ----
generateBtn.addEventListener("click", async () => {
  statusEl.classList.remove("error", "success");
  playerWrap.hidden = true;

  const voice = voiceSelect.value;
  const rate = rateSelect.value;

  if (!voice) {
    statusEl.textContent = "Please select a voice.";
    statusEl.classList.add("error");
    return;
  }

  generateBtn.disabled = true;
  btnLabel.hidden = true;
  btnSpinner.classList.add("visible");
  statusEl.textContent = "Generating audio... this can take a few seconds for long text.";

  try {
    let response;

    if (activeTab === "text-tab") {
      const text = textInput.value.trim();
      if (!text) {
        throw new Error("Please paste some text first.");
      }
      if (autoSpeedOn && !targetTimeInput.value) {
        throw new Error("Enter a target time, or turn off Auto Speed.");
      }

      const formData = new FormData();
      formData.append("text", text);
      formData.append("voice", voice);
      formData.append("rate", rate);
      formData.append("auto_speed", String(autoSpeedOn));
      if (autoSpeedOn) {
        formData.append("target_time", targetTimeInput.value);
      }

      response = await fetch(`${API_BASE}/generate`, {
        method: "POST",
        body: formData,
      });
    } else {
      if (!fileInput.files.length) {
        throw new Error("Please choose a transcript file first.");
      }
      if (autoSpeedOn && !targetTimeInput.value) {
        throw new Error("Enter a target time, or turn off Auto Speed.");
      }

      const formData = new FormData();
      formData.append("file", fileInput.files[0]);
      formData.append("voice", voice);
      formData.append("rate", rate);
      formData.append("auto_speed", String(autoSpeedOn));
      if (autoSpeedOn) {
        formData.append("target_time", targetTimeInput.value);
      }

      response = await fetch(`${API_BASE}/generate-from-file`, {
        method: "POST",
        body: formData,
      });
    }

    if (!response.ok) {
      let errMsg = "Generation failed.";
      try {
        const errBody = await response.json();
        errMsg = errBody.detail || errMsg;
      } catch (_) { /* ignore */ }
      throw new Error(errMsg);
    }

    const blob = await response.blob();
    const audioUrl = URL.createObjectURL(blob);

    audioPlayer.src = audioUrl;
    downloadLink.href = audioUrl;
    playerWrap.hidden = false;
    statusEl.textContent = "Done! Preview it below or download the MP3.";
    statusEl.classList.add("success");
  } catch (err) {
    statusEl.textContent = err.message || "Something went wrong.";
    statusEl.classList.add("error");
  } finally {
    generateBtn.disabled = false;
    btnLabel.hidden = false;
    btnSpinner.classList.remove("visible");
  }
});

loadVoices();
