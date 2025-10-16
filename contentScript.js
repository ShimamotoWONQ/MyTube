const CONFIG_STORAGE_KEY = "mytubeConfig";

const FALLBACK_SELECTORS = {
  watchApp: "ytd-watch-flexy",
  chat: "#chat",
  chatFrame: "ytd-live-chat-frame",
  miniPlayer: "ytd-miniplayer",
  controlBar: ".ytp-chrome-bottom",
  controlButtons:
    ".ytp-chrome-controls .ytp-left-controls button, .ytp-chrome-controls .ytp-right-controls button",
  playButton: "button.ytp-play-button",
  muteButton: "button.ytp-mute-button",
  subtitlesButton: "button.ytp-subtitles-button",
  settingsButton: "button.ytp-settings-button",
  theaterButton: "button.ytp-size-button",
  fullscreenButton: "button.ytp-fullscreen-button",
  pipButton: "button.ytp-pip-button",
  topBar: "#masthead-container",
  guide: "#guide",
  comments: "#comments",
  secondary: "#secondary"
};

const SELECTOR_MAP = {
  ...FALLBACK_SELECTORS,
  ...((window && window.MyTubeSelectors) || {})
};

const LOG_SOURCE = "content";

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

const STYLE_ELEMENT_ID = "mytube-style";
const FONT_LINK_ID = "mytube-material-icons";

let currentConfig = { ...DEFAULT_CONFIG };
let videoElement = null;
let navigationObserverAttached = false;
let controlRefreshQueued = false;
let previousConfigSignature = null;
let controlsEnhanced = false;
let fullscreenChatHidden = false;
let lastFullscreenState = null;

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

const ICON_CONFIG = {
  play: {
    selector: SELECTOR_MAP.playButton,
    compute: () => {
      if (!videoElement) {
        return "play_arrow";
      }
      return videoElement.paused ? "play_arrow" : "pause";
    }
  },
  mute: {
    selector: SELECTOR_MAP.muteButton,
    compute: () => {
      if (!videoElement) {
        return "volume_up";
      }
      if (videoElement.muted || videoElement.volume === 0) {
        return "volume_off";
      }
      if (videoElement.volume < 0.5) {
        return "volume_down";
      }
      return "volume_up";
    }
  },
  subtitles: {
    selector: SELECTOR_MAP.subtitlesButton,
    compute: (button) =>
      button?.getAttribute("aria-pressed") === "true"
        ? "closed_caption"
        : "closed_caption_off"
  },
  settings: {
    selector: SELECTOR_MAP.settingsButton,
    compute: () => "settings"
  },
  theater: {
    selector: SELECTOR_MAP.theaterButton,
    compute: (button) =>
      button?.getAttribute("aria-pressed") === "true"
        ? "video_settings"
        : "video_label"
  },
  fullscreen: {
    selector: SELECTOR_MAP.fullscreenButton,
    compute: (button) =>
      button?.getAttribute("aria-pressed") === "true"
        ? "fullscreen_exit"
        : "fullscreen"
  },
  pip: {
    selector: SELECTOR_MAP.pipButton,
    compute: () => "picture_in_picture_alt"
  }
};

const root = document.documentElement;

function logEvent(message, meta = null) {
  try {
    chrome.runtime
      .sendMessage({
        type: "mytube-log",
        payload: {
          message,
          meta,
          source: LOG_SOURCE
        }
      })
      .catch(() => {});
  } catch (error) {
    // Ignore logging failures (likely popup closed or service worker idle).
  }
}

function ensureFont() {
  if (document.getElementById(FONT_LINK_ID)) {
    return;
  }
  const link = document.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght@400";
  document.head.appendChild(link);
}

function ensureStyle() {
  if (document.getElementById(STYLE_ELEMENT_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = `
:root.mytube-hide-topbar ${SELECTOR_MAP.topBar} {
  display: none !important;
}

:root.mytube-hide-guide ${SELECTOR_MAP.guide} {
  display: none !important;
}

:root.mytube-hide-comments ${SELECTOR_MAP.comments} {
  display: none !important;
}

:root.mytube-hide-secondary ${SELECTOR_MAP.secondary} {
  display: none !important;
}

:root.mytube-hide-chat ${SELECTOR_MAP.chat},
:root.mytube-hide-chat ${SELECTOR_MAP.chatFrame} {
  display: none !important;
}

:root.mytube-disable-fullscreen-chat.mytube-fullscreen-active ${SELECTOR_MAP.chat},
:root.mytube-disable-fullscreen-chat.mytube-fullscreen-active ${SELECTOR_MAP.chatFrame} {
  display: none !important;
}
:root.mytube-legacy-control-icons .ytp-button {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
}

:root.mytube-legacy-control-icons .ytp-button svg,
:root.mytube-legacy-control-icons .ytp-button path,
:root.mytube-legacy-control-icons .ytp-button .ytp-svg-fill {
  display: none !important;
}

:root.mytube-legacy-control-icons .ytp-button .mytube-icon {
  font-family: "Material Symbols Outlined", sans-serif !important;
  font-size: 28px;
  font-variation-settings: "FILL" 1, "wght" 400, "GRAD" 0, "opsz" 24;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #fff;
  pointer-events: none;
}

:root.mytube-icon-backdrop .ytp-button {
  background: none !important;
  border: none !important;
  box-shadow: none !important;
}

:root.mytube-transparent-controls ${SELECTOR_MAP.controlBar} {
  background: transparent !important;
}

:root.mytube-hide-quick-actions .ytp-fullscreen-quick-actions {
  display: none !important;
}
  `;
  document.head.appendChild(style);
}

async function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(CONFIG_STORAGE_KEY, (value) => {
      const stored = value?.[CONFIG_STORAGE_KEY];
      resolve({ ...DEFAULT_CONFIG, ...normaliseConfig(stored || {}) });
    });
  });
}

function applyConfig(config) {
  const nextConfig = { ...DEFAULT_CONFIG, ...normaliseConfig(config) };
  const signature = JSON.stringify(nextConfig);
  if (signature !== previousConfigSignature) {
    previousConfigSignature = signature;
    logEvent("設定を適用しました", { config: nextConfig });
  }
  currentConfig = nextConfig;
  toggleClass("mytube-hide-topbar", currentConfig.hideTopBar);
  toggleClass("mytube-hide-guide", currentConfig.hideGuide);
  toggleClass("mytube-hide-comments", currentConfig.hideComments);
  toggleClass("mytube-hide-secondary", currentConfig.hideSecondary);
  toggleClass("mytube-hide-chat", currentConfig.hideChat);
  toggleClass(
    "mytube-disable-fullscreen-chat",
    currentConfig.disableFullscreenLiveChat
  );
  toggleClass(
    "mytube-legacy-control-icons",
    currentConfig.useLegacyControlIcons
  );
  toggleClass("mytube-icon-backdrop", currentConfig.useIconBackdrop);
  toggleClass(
    "mytube-transparent-controls",
    currentConfig.transparentControlBar
  );
  toggleClass(
    "mytube-hide-quick-actions",
    currentConfig.hideFullscreenQuickActions
  );

  if (currentConfig.useLegacyControlIcons) {
    queueControlRefresh();
  } else {
    teardownControlEnhancements();
  }

  handleFullscreenChange(); // Re-evaluate fullscreen chat state.
}

function toggleClass(className, shouldEnable) {
  root.classList.toggle(className, Boolean(shouldEnable));
}

function queueControlRefresh() {
  if (!currentConfig.useLegacyControlIcons) {
    return;
  }
  if (controlRefreshQueued) {
    return;
  }
  controlRefreshQueued = true;
  requestAnimationFrame(() => {
    controlRefreshQueued = false;
    ensureVideoListeners();
    upgradeControlButtons();
    updateAllIcons();
  });
}

function ensureVideoListeners() {
  const candidate =
    document.querySelector("video.html5-main-video") ||
    document.querySelector("video");
  if (!candidate || candidate === videoElement) {
    return;
  }

  if (videoElement) {
    videoElement.removeEventListener("play", updateAllIcons);
    videoElement.removeEventListener("pause", updateAllIcons);
    videoElement.removeEventListener("volumechange", updateAllIcons);
  }

  videoElement = candidate;
  videoElement.addEventListener("play", updateAllIcons);
  videoElement.addEventListener("pause", updateAllIcons);
  videoElement.addEventListener("volumechange", updateAllIcons);
  updateAllIcons();
}

function upgradeControlButtons() {
  let addedIcon = false;
  Object.keys(ICON_CONFIG).forEach((key) => {
    const { selector } = ICON_CONFIG[key];
    if (!selector) {
      return;
    }
    const button = document.querySelector(selector);
    if (!button) {
      return;
    }
    if (!button.classList.contains("mytube-icon-button")) {
      button.classList.add("mytube-icon-button");
      const iconSpan = document.createElement("span");
      iconSpan.className = "mytube-icon";
      iconSpan.setAttribute("aria-hidden", "true");
      button.prepend(iconSpan);
      addedIcon = true;
    }
  });
  if (addedIcon && !controlsEnhanced) {
    controlsEnhanced = true;
    logEvent("プレイヤーコントロールを旧仕様のアイコンに置き換えました");
  }
}

function teardownControlEnhancements() {
  document
    .querySelectorAll(".mytube-icon-button .mytube-icon")
    .forEach((span) => span.remove());
  document
    .querySelectorAll(".mytube-icon-button")
    .forEach((button) => button.classList.remove("mytube-icon-button"));
  if (controlsEnhanced) {
    controlsEnhanced = false;
    logEvent("プレイヤーコントロールを標準表示に戻しました");
  }
}

function updateAllIcons() {
  if (!currentConfig.useLegacyControlIcons) {
    return;
  }
  Object.keys(ICON_CONFIG).forEach((key) => {
    const { selector, compute } = ICON_CONFIG[key];
    if (!selector) {
      return;
    }
    const button = document.querySelector(selector);
    if (!button) {
      return;
    }
    if (!button.classList.contains("mytube-icon-button")) {
      // Button might not be ready yet; ensure it gets upgraded soon.
      queueControlRefresh();
      return;
    }
    const span = button.querySelector(".mytube-icon");
    if (!span) {
      return;
    }
    const iconName = compute(button);
    if (iconName && span.textContent !== iconName) {
      span.textContent = iconName;
    }
  });
}

function handleMutation() {
  if (currentConfig.useLegacyControlIcons) {
    queueControlRefresh();
  }
  if (currentConfig.hideChat || currentConfig.disableFullscreenLiveChat) {
    handleFullscreenChange();
  }
}

function attachObservers() {
  const observer = new MutationObserver(handleMutation);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-pressed", "class"]
  });
}

function attachNavigationListener() {
  if (navigationObserverAttached) {
    return;
  }
  navigationObserverAttached = true;
  window.addEventListener("yt-navigate-finish", () => {
    queueControlRefresh();
    applyConfig(currentConfig);
  });
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
}

function handleFullscreenChange() {
  const isFullscreen = Boolean(document.fullscreenElement);
  toggleClass("mytube-fullscreen-active", isFullscreen);
  if (isFullscreen !== lastFullscreenState) {
    logEvent(
      isFullscreen
        ? "フルスクリーンモードに移行しました"
        : "フルスクリーンモードを終了しました"
    );
    lastFullscreenState = isFullscreen;
  }
  if (!currentConfig.disableFullscreenLiveChat) {
    fullscreenChatHidden = false;
    return;
  }
  if (isFullscreen) {
    const chatFrame =
      document.querySelector(SELECTOR_MAP.chatFrame) ||
      document.querySelector(SELECTOR_MAP.chat);
    if (chatFrame) {
      chatFrame.setAttribute("data-mytube-hidden", "true");
      chatFrame.style.display = "none";
      if (!fullscreenChatHidden) {
        fullscreenChatHidden = true;
        logEvent("フルスクリーン中のライブコメントを非表示にしました");
      }
    }
  } else {
    document
      .querySelectorAll(
        `${SELECTOR_MAP.chatFrame}[data-mytube-hidden], ${SELECTOR_MAP.chat}[data-mytube-hidden]`
      )
      .forEach((element) => {
        element.style.removeProperty("display");
        element.removeAttribute("data-mytube-hidden");
      });
    if (fullscreenChatHidden) {
      fullscreenChatHidden = false;
      logEvent("ライブコメントの表示を復帰しました");
    }
  }
}

function handleStorageChange(changes, areaName) {
  if (areaName !== "sync") {
    return;
  }
  if (!changes[CONFIG_STORAGE_KEY]) {
    return;
  }
  const { newValue } = changes[CONFIG_STORAGE_KEY];
  applyConfig({ ...DEFAULT_CONFIG, ...(newValue || {}) });
}

async function init() {
  logEvent("コンテンツスクリプトの初期化を開始しました");
  ensureFont();
  ensureStyle();
  const config = await loadConfig();
  applyConfig(config);
  attachObservers();
  attachNavigationListener();
  chrome.storage.onChanged.addListener(handleStorageChange);
  queueControlRefresh();
  logEvent("コンテンツスクリプトの初期化が完了しました");
}

init().catch((error) => {
  logEvent("コンテンツスクリプトの初期化に失敗しました", {
    error: error?.message || String(error)
  });
  console.error("MyTube failed to initialise", error);
});
