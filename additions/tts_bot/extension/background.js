// Fox-Auto Copilot - Background Service Worker
// Manages 6-minute Watchdog timer, Safe Tab Cleanup, and Real-Time State Forwarding

const BACKEND_BASE = "http://127.0.0.1:8787/api/copilot";

let activeWatchdogs = {};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "START_6MIN_WATCHDOG") {
    const pid = message.profileId;
    const tabId = sender.tab ? sender.tab.id : null;
    console.log(`[Watchdog] Received START_6MIN_WATCHDOG for profile ${pid} on Tab ${tabId}`);

    // 1. Safe Tab Cleanup: Close auxiliary tabs to free up RAM/CPU
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      let closedCount = 0;
      tabs.forEach((t) => {
        if (t.id !== tabId) {
          const u = (t.url || "").toLowerCase();
          if (u.includes("live.com") || u.includes("login.microsoft") || u.includes("sms8.net") || u.includes("temp")) {
            chrome.tabs.remove(t.id);
            closedCount++;
          }
        }
      });
      console.log(`[Watchdog] Closed ${closedCount} auxiliary tabs.`);
    });

    // 2. Start 6-minute watchdog loop (360 seconds)
    const startTime = Date.now();
    const duration = 6 * 60 * 1000;

    if (activeWatchdogs[pid]) {
      clearInterval(activeWatchdogs[pid]);
    }

    activeWatchdogs[pid] = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remainingSeconds = Math.max(0, Math.floor((duration - elapsed) / 1000));

      if (elapsed >= duration) {
        clearInterval(activeWatchdogs[pid]);
        delete activeWatchdogs[pid];
        if (tabId) {
          chrome.tabs.sendMessage(tabId, { action: "WATCHDOG_EXPIRED", profileId: pid });
        }
        return;
      }

      // Send tick to content script
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          action: "WATCHDOG_TICK",
          profileId: pid,
          remainingSeconds: remainingSeconds
        }, (res) => {
          // If content script returned definitive state
          if (res && res.status) {
            if (res.status === "EDIT_AVAILABLE" || res.status === "APPEAL_TRIGGERED" || res.status === "APPROVED") {
              console.log(`[Watchdog] Terminal event detected: ${res.status}. Halting countdown.`);
              clearInterval(activeWatchdogs[pid]);
              delete activeWatchdogs[pid];
            }
          }
        });
      }
    }, 10000); // Poll every 10 seconds

    sendResponse({ success: true, message: "6-Minute Watchdog armed" });
    return true;
  }

  if (message.action === "SYNC_DOM_STATE") {
    // Forward directly to Backend Live Bus
    fetch(`${BACKEND_BASE}/state_update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message.payload)
    })
    .then(r => r.json())
    .then(data => sendResponse({ success: true, data }))
    .catch(err => sendResponse({ success: false, error: err.toString() }));
    return true;
  }
});

// ==============================================================================
// AUTO-LOCK MOBILE VIEWPORT (LOCK CTRL + SHIFT + M ACROSS ALL TABS)
// ==============================================================================
function enforceMobileWindowSize() {
  chrome.windows.getCurrent({ populate: false }, (win) => {
    if (chrome.runtime.lastError || !win) return;
    // If window is wider than 500px, clamp it to phone viewport (430 x 932 - iPhone 15 Pro Max)
    if (win.width > 500) {
      chrome.windows.update(win.id, { width: 430, height: 932 });
    }
  });
}

// Auto-lock when browser starts up
enforceMobileWindowSize();

// Auto-lock whenever any new tab is created
chrome.tabs.onCreated.addListener(() => {
  enforceMobileWindowSize();
});
