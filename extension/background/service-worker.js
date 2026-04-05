
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({
      cogniflow_active: true,
      cogniflow_profiles: [],  
      cogniflow_backend_url: "http://localhost:8000",
      cogniflow_first_run: true
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "STATUS_UPDATE" && sender.tab) {
    const tabId = sender.tab.id;
    const data = message.data;

    if (data.stats && data.stats.casBefore > 0) {
      const score = data.stats.casAfter || data.stats.casBefore;
      const color = score >= 70 ? "#1D9E75" : score >= 45 ? "#EF9F27" : "#E24B4A";

      chrome.action.setBadgeText({ text: String(score), tabId });
      chrome.action.setBadgeBackgroundColor({ color, tabId });
    }
  }

  if (message.type === "SETTINGS_CHANGED") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "SET_PROFILES",
          profiles: message.profiles,
          backendUrl: message.backendUrl
        }).catch(() => {});
      }
    });
  }

  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    chrome.action.setBadgeText({ text: "", tabId });
  }
});
