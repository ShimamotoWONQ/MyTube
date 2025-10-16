const CONFIG_STORAGE_KEY = "mytubeConfig";
const DEFAULT_CONFIG = Object.freeze({
  hideTopBar: false,
  hideGuide: false,
  hideComments: false,
  hideSecondary: false,
  hideChat: false,
  useLegacyControlIcons: true,
  useIconBackdrop: true,
  transparentControlBar: true,
  hideFullscreenQuickActions: true,
  disableFullscreenLiveChat: true
});

const LOG_LIMIT = 100;

let currentConfig = { ...DEFAULT_CONFIG };
let statusTimeout = null;
let logsCache = [];
let logListElement = null;

function normaliseConfig(config = {}) {
  const nextConfig = { ...(config || {}) };
  if (Object.prototype.hasOwnProperty.call(nextConfig, "restoreControls")) {
    const legacyValue = Boolean(nextConfig.restoreControls);
    if (!Object.prototype.hasOwnProperty.call(nextConfig, "useLegacyControlIcons")) {
      nextConfig.useLegacyControlIcons = legacyValue;
    }
    if (!Object.prototype.hasOwnProperty.call(nextConfig, "useIconBackdrop")) {
      nextConfig.useIconBackdrop = legacyValue;
    }
    if (!Object.prototype.hasOwnProperty.call(nextConfig, "transparentControlBar")) {
      nextConfig.transparentControlBar = legacyValue;
    }
    if (
      !Object.prototype.hasOwnProperty.call(nextConfig, "hideFullscreenQuickActions")
    ) {
      nextConfig.hideFullscreenQuickActions = legacyValue;
    }
    delete nextConfig.restoreControls;
  }
  if (!Object.prototype.hasOwnProperty.call(nextConfig, "transparentControlBar")) {
    nextConfig.transparentControlBar = DEFAULT_CONFIG.transparentControlBar;
  }
  if (
    !Object.prototype.hasOwnProperty.call(nextConfig, "hideFullscreenQuickActions")
  ) {
    nextConfig.hideFullscreenQuickActions =
      DEFAULT_CONFIG.hideFullscreenQuickActions;
  }
  if (Object.prototype.hasOwnProperty.call(nextConfig, "useLegacyControlLayout")) {
    delete nextConfig.useLegacyControlLayout;
  }
  if (Object.prototype.hasOwnProperty.call(nextConfig, "removeOverlays")) {
    delete nextConfig.removeOverlays;
  }
  return nextConfig;
}

function getInputs() {
  return Array.from(document.querySelectorAll("input[data-config-key]"));
}

function showStatus(message) {
  const status = document.getElementById("status");
  if (!status) {
    return;
  }
  status.textContent = message;
  if (statusTimeout) {
    clearTimeout(statusTimeout);
  }
  statusTimeout = setTimeout(() => {
    status.textContent = "";
  }, 2200);
}

async function saveConfig(config) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [CONFIG_STORAGE_KEY]: config }, resolve);
  });
}

function applyConfigToForm(config) {
  const normalised = normaliseConfig(config);
  currentConfig = { ...DEFAULT_CONFIG, ...normalised };
  getInputs().forEach((input) => {
    const key = input.dataset.configKey;
    input.checked = Boolean(currentConfig[key]);
  });
}

function readConfigFromForm() {
  const nextConfig = { ...currentConfig };
  getInputs().forEach((input) => {
    const key = input.dataset.configKey;
    nextConfig[key] = input.checked;
  });
  return nextConfig;
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "";
  }
  const date = new Date(timestamp);
  const hh = `${date.getHours()}`.padStart(2, "0");
  const mm = `${date.getMinutes()}`.padStart(2, "0");
  const ss = `${date.getSeconds()}`.padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function serialiseMeta(meta) {
  if (!meta || (typeof meta === "object" && Object.keys(meta).length === 0)) {
    return "";
  }
  try {
    return JSON.stringify(meta, null, 2);
  } catch (error) {
    return String(meta);
  }
}

function createLogListItem(entry) {
  const li = document.createElement("li");
  li.className = "log-item";

  const header = document.createElement("div");
  header.className = "log-header";

  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = formatTimestamp(entry.timestamp);

  const source = document.createElement("span");
  source.className = "log-source";
  source.textContent = entry.source || "system";

  header.appendChild(time);
  header.appendChild(source);

  const message = document.createElement("div");
  message.className = "log-message";
  message.textContent = entry.message || "";

  li.appendChild(header);
  li.appendChild(message);

  const metaText = serialiseMeta(entry.meta);
  if (metaText) {
    const metaElement = document.createElement("pre");
    metaElement.className = "log-meta";
    metaElement.textContent = metaText;
    li.appendChild(metaElement);
  }

  return li;
}

function renderLogs(logs) {
  if (!logListElement) {
    return;
  }
  logsCache = logs.slice(-LOG_LIMIT);
  logListElement.innerHTML = "";
  if (logsCache.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "log-item log-empty";
    emptyItem.textContent = "ログはまだありません。";
    logListElement.appendChild(emptyItem);
    return;
  }
  logsCache
    .slice()
    .reverse()
    .forEach((entry) => {
      logListElement.appendChild(createLogListItem(entry));
    });
}

function appendLogEntry(entry) {
  logsCache.push(entry);
  if (logsCache.length > LOG_LIMIT) {
    logsCache.shift();
  }
  if (!logListElement) {
    return;
  }
  const firstChild = logListElement.firstElementChild;
  if (firstChild && firstChild.classList.contains("log-empty")) {
    logListElement.removeChild(firstChild);
  }
  const item = createLogListItem(entry);
  logListElement.prepend(item);
  while (logListElement.children.length > logsCache.length) {
    logListElement.removeChild(logListElement.lastChild);
  }
}

function logFromPopup(message, meta = null) {
  try {
    chrome.runtime
      .sendMessage({
        type: "mytube-log",
        payload: {
          message,
          meta,
          source: "popup"
        }
      })
      .catch(() => {});
  } catch (error) {
    console.warn("MyTube popup: failed to send log", error);
  }
}

async function handleInputChange(event) {
  const nextConfig = readConfigFromForm();
  currentConfig = nextConfig;
  await saveConfig(currentConfig);
  const input = event.target;
  const label =
    input?.closest(".option-item")?.querySelector("span")?.textContent || "";
  logFromPopup("設定を更新しました", {
    key: input?.dataset?.configKey,
    label,
    enabled: input?.checked
  });
  showStatus("保存しました");
}

async function handleReset() {
  applyConfigToForm(DEFAULT_CONFIG);
  currentConfig = { ...DEFAULT_CONFIG };
  await saveConfig(currentConfig);
  logFromPopup("設定をデフォルトにリセットしました");
  showStatus("デフォルトに戻しました");
}

async function refreshLogs() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "mytube-get-status"
    });
    renderLogs(response?.logs || []);
    if (response?.config) {
      applyConfigToForm(response.config);
    }
    showStatus("ログを更新しました");
  } catch (error) {
    console.error("MyTube popup: failed to refresh logs", error);
    showStatus("ログの取得に失敗しました");
  }
}

async function clearLogs() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "mytube-clear-logs"
    });
    if (response?.ok) {
      renderLogs([]);
      logFromPopup("コンソールログをクリアしました");
      showStatus("ログをクリアしました");
    }
  } catch (error) {
    console.error("MyTube popup: failed to clear logs", error);
    showStatus("ログのクリアに失敗しました");
  }
}

function attachEventListeners() {
  getInputs().forEach((input) => {
    input.addEventListener("change", handleInputChange);
  });

  const resetButton = document.getElementById("reset-button");
  if (resetButton) {
    resetButton.addEventListener("click", handleReset);
  }

  const refreshButton = document.getElementById("refresh-logs");
  if (refreshButton) {
    refreshButton.addEventListener("click", refreshLogs);
  }

  const clearButton = document.getElementById("clear-logs");
  if (clearButton) {
    clearButton.addEventListener("click", clearLogs);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "mytube-log-update" && message.entry) {
      appendLogEntry(message.entry);
    }
  });
}

async function fetchInitialState() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "mytube-get-status"
    });
    return {
      config: response?.config || null,
      logs: response?.logs || []
    };
  } catch (error) {
    console.warn("MyTube popup: falling back to storage fetch", error);
    const storedConfig = await new Promise((resolve) => {
      chrome.storage.sync.get(CONFIG_STORAGE_KEY, (value) => {
        resolve(value?.[CONFIG_STORAGE_KEY] || null);
      });
    });
    return { config: storedConfig, logs: [] };
  }
}

async function init() {
  logListElement = document.getElementById("log-list");

  const { config, logs } = await fetchInitialState();
  applyConfigToForm(config || DEFAULT_CONFIG);
  renderLogs(logs || []);

  attachEventListeners();
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((error) => {
    console.error("MyTube popup failed to initialise", error);
    showStatus("設定の読み込みに失敗しました");
  });
});
