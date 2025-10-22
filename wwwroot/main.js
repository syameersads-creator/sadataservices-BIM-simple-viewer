// === S&A 4D Viewer Main Script ===

// Initialize Viewer
let viewer;
let currentUrn = null;
let schedule = null;
let fourdExt = null;

// Utility toast overlay (small top-right messages)
function showOverlay(msg, duration = 2000) {
  let overlay = document.getElementById("overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "overlay";
    overlay.style.position = "fixed";
    overlay.style.top = "20px";
    overlay.style.right = "20px";
    overlay.style.background = "rgba(0,0,0,0.7)";
    overlay.style.color = "#fff";
    overlay.style.padding = "10px 20px";
    overlay.style.borderRadius = "8px";
    overlay.style.zIndex = "999";
    document.body.appendChild(overlay);
  }
  overlay.innerText = msg;
  overlay.style.display = "block";
  setTimeout(() => (overlay.style.display = "none"), duration);
}

// === GLOBAL OVERLAY CONTROLS ===
function showGlobalOverlay(title = "Loading...", startPercent = 0) {
  const overlay = document.getElementById("globalOverlay");
  const bar = document.getElementById("overlayBar");
  const text = document.getElementById("overlayTitle");
  const percent = document.getElementById("overlayPercent");
  overlay.style.display = "flex";
  text.textContent = title;
  bar.style.width = `${startPercent}%`;
  percent.textContent = `${startPercent}%`;
}

function updateGlobalProgress(progress, text = null) {
  const bar = document.getElementById("overlayBar");
  const title = document.getElementById("overlayTitle");
  const percent = document.getElementById("overlayPercent");
  if (text) title.textContent = text;
  bar.style.width = `${progress}%`;
  percent.textContent = `${Math.floor(progress)}%`;
}

function hideGlobalOverlay(delay = 800) {
  setTimeout(() => {
    document.getElementById("globalOverlay").style.display = "none";
  }, delay);
}

// === MODEL DROPDOWN POPULATION ===
async function loadModelList() {
  const select = document.getElementById("modelSelect");
  select.innerHTML = '<option value="">Select Model</option>';

  const res = await fetch("/api/models");
  if (!res.ok) return console.warn("⚠️ Failed to fetch models list");

  const models = await res.json();
  models.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.urn;
    opt.textContent = m.name;
    select.appendChild(opt);
  });
}

// When dropdown changes, load selected model
document.getElementById("modelSelect").onchange = (e) => {
  const urn = e.target.value;
  if (urn) {
    showGlobalOverlay("Loading selected model...", 0);
    initViewer(urn);
  }
};

// Call once on page load
window.addEventListener("DOMContentLoaded", loadModelList);
document.getElementById("refreshModels").onclick = loadModelList;

// ================================
// Initialize Autodesk Viewer
async function initViewer(urn) {
  const tokenResponse = await fetch("/api/auth/token");
  const token = await tokenResponse.json();

  const options = {
    env: "AutodeskProduction",
    api: "derivativeV2",
    getAccessToken: (onTokenReady) => {
      onTokenReady(token.access_token, token.expires_in);
    },
  };

  Autodesk.Viewing.Initializer(options, async () => {
    const container = document.getElementById("viewer");
    viewer = new Autodesk.Viewing.GuiViewer3D(container);
    viewer.start();
    window.myViewer = viewer;

    Autodesk.Viewing.Document.load(
      "urn:" + urn,
      (doc) => {
        const defaultModel = doc.getRoot().getDefaultGeometry();
        showGlobalOverlay("Loading model geometry...", 0);

        const modelPromise = viewer.loadDocumentNode(doc, defaultModel);
        modelPromise
          .then((model) => {
            model.addEventListener(
              Autodesk.Viewing.PROGRESS_UPDATE_EVENT,
              (e) => {
                const pct = Math.floor((e.loaded / e.total) * 100);
                updateGlobalProgress(pct);
              }
            );
            viewer.addEventListener(
              Autodesk.Viewing.GEOMETRY_LOADED_EVENT,
              () => {
                updateGlobalProgress(100, "Model loaded successfully!");
                hideGlobalOverlay();
              }
            );
          })
          .catch((err) => {
            console.error(err);
            hideGlobalOverlay();
            showOverlay("Error loading model");
          });
      },
      (err) => {
        console.error(err);
        hideGlobalOverlay();
        showOverlay("Error loading document");
      }
    );
  });
}

// === UPLOAD MODEL (UNIFIED OVERLAY) ===
document.getElementById("uploadModelBtn").onclick = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".rvt,.zip,.nwd";
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showGlobalOverlay("Uploading model...", 0);
    let fakeProgress = 0;
    const simulate = setInterval(() => {
      fakeProgress = Math.min(fakeProgress + Math.random() * 10, 90);
      updateGlobalProgress(fakeProgress);
    }, 300);

    const form = new FormData();
    form.append("model-file", file);
    const resp = await fetch("/api/models", { method: "POST", body: form });
    clearInterval(simulate);

    if (!resp.ok) {
      hideGlobalOverlay();
      return showOverlay("Upload failed");
    }

    const model = await resp.json();
    updateGlobalProgress(90, "Translating model...");
    pollTranslation(model.urn);
  };
  input.click();
};

async function pollTranslation(urn) {
  const res = await fetch(`/api/models/${urn}/status`);
  const data = await res.json();

  if (data.status === "success") {
    updateGlobalProgress(100, "Model ready — loading...");
    setTimeout(() => initViewer(urn), 1000);
  } else if (data.status === "inprogress") {
    setTimeout(() => pollTranslation(urn), 3000);
  } else {
    hideGlobalOverlay();
    showOverlay("Translation failed");
  }
}

// === SCHEDULE UPLOAD (UNIFIED OVERLAY) ===
async function uploadSchedule(urn) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv";
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showGlobalOverlay("Uploading schedule...", 10);

    const form = new FormData();
    form.append("schedule-file", file);
    const resp = await fetch(`/api/schedule/${urn}`, {
      method: "POST",
      body: form,
    });

    if (!resp.ok) {
      hideGlobalOverlay();
      return showOverlay("Schedule upload failed");
    }

    const data = await resp.json();
    updateGlobalProgress(100, `Schedule uploaded (${data.tasks.length} tasks)`);
    hideGlobalOverlay();
    schedule = data;
    const viewerInstance = window.myViewer;
    fourdExt = viewerInstance.getExtension("FourDPlayback");
    fourdExt.initSchedule(schedule);
  };
  input.click();
}

// === 4D ENHANCEMENT HOOKS ===
document.getElementById("uploadScheduleBtn").onclick = async () => {
  if (!currentUrn) return alert("Load a model first.");
  await uploadSchedule(currentUrn);
};

document.getElementById("playBtn").onclick = () => {
  if (!fourdExt || !schedule) return alert("Upload schedule first");
  fourdExt.play();
};
