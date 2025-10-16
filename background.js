const CONFIG_STORAGE_KEY = "mytubeConfig";
const LOG_STORAGE_KEY = "mytubeLogs";
const MAX_LOGS = 100;

function buildLogEntry(message, { meta = null, source = "system" } = {}) {
  return {
    id: typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    message,
    source,
    meta,
    timestamp: Date.now()
  };
}

async function getLogs() {
  const stored = await chrome.storage.local.get(LOG_STORAGE_KEY);
  return stored?.[LOG_STORAGE_KEY] || [];
}

async function setLogs(logs) {
  await chrome.storage.local.set({ [LOG_STORAGE_KEY]: logs });
}

async function appendLog(entry) {
  const logs = await getLogs();
  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }
  await setLogs(logs);
  await broadcastLog(entry);
}

async function broadcastLog(entry) {
  try {
    await chrome.runtime.sendMessage({
      type: "mytube-log-update",
      entry
    });
  } catch (error) {
    // No active listeners; ignore.
  }
}

async function getConfig() {
  const stored = await chrome.storage.sync.get(CONFIG_STORAGE_KEY);
  return stored?.[CONFIG_STORAGE_KEY] || null;
}

chrome.runtime.onInstalled.addListener(() => {
  appendLog(
    buildLogEntry("拡張機能がインストールされました", {
      source: "system"
    })
  );
});

chrome.runtime.onStartup.addListener(() => {
  appendLog(
    buildLogEntry("ブラウザ起動に伴いサービスワーカーを初期化しました", {
      source: "system"
    })
  );
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return;
  }

  if (message.type === "mytube-log") {
    (async () => {
      const entry = buildLogEntry(message.payload?.message || "", {
        meta: message.payload?.meta || null,
        source: message.payload?.source || sender?.url || "unknown"
      });
      await appendLog(entry);
      sendResponse({ ok: true });
    })().catch((error) => {
      console.error("MyTube: failed to append log", error);
      sendResponse({ ok: false, error: error?.message });
    });
    return true;
  }

  if (message.type === "mytube-get-status") {
    (async () => {
      const [logs, config] = await Promise.all([getLogs(), getConfig()]);
      sendResponse({ logs, config });
    })().catch((error) => {
      console.error("MyTube: failed to fetch status", error);
      sendResponse({ logs: [], config: null, error: error?.message });
    });
    return true;
  }

  if (message.type === "mytube-clear-logs") {
    (async () => {
      await setLogs([]);
      sendResponse({ ok: true });
    })().catch((error) => {
      console.error("MyTube: failed to clear logs", error);
      sendResponse({ ok: false, error: error?.message });
    });
    return true;
  }
});
