chrome.action.onClicked.addListener(() => {
  
  chrome.runtime.openOptionsPage();
  chrome.windows.update(chrome.windows.WINDOW_ID_CURRENT, { state: "fullscreen" });

});