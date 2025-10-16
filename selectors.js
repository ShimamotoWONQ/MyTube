const SELECTORS = Object.freeze({
  watchApp: "ytd-watch-flexy",
  chat: "#chat",
  chatFrame: "ytd-live-chat-frame",
  miniPlayer: "ytd-miniplayer",
  controlBar: ".ytp-chrome-bottom",
  controlButtons: ".ytp-chrome-controls .ytp-left-controls button, .ytp-chrome-controls .ytp-right-controls button",
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
});

if (!window.MyTubeSelectors) {
  window.MyTubeSelectors = SELECTORS;
}
