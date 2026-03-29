/**
 * Background Service Worker for YouTube Czech Dubbing extension.
 * Handles extension lifecycle events and inter-script communication.
 */

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[CzechDub] Extension installed');

    // Set default settings
    chrome.storage.local.set({
      czechDubSettings: {
        ttsRate: 1.1,
        ttsVolume: 0.95,
        ttsPitch: 1.0,
        reducedOriginalVolume: 0.15,
        muteOriginal: false
      }
    });
  }
});

// Forward messages between popup and content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'status-update') {
    // Forward status updates to popup (if open)
    // This is handled by the popup's own listener
  }
  return false;
});

// Handle tab updates - notify content script when YouTube navigates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('youtube.com/watch')) {
    // Tab navigation complete on a YouTube video page
    chrome.tabs.sendMessage(tabId, { type: 'tab-updated' }).catch(() => {
      // Content script may not be injected yet
    });
  }
});
