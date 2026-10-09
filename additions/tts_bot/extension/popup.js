// Fox-Auto Copilot Extension Popup Script

document.getElementById('btn-open-tts')?.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://seller-us.tiktok.com/account/register' });
  window.close();
});

document.getElementById('btn-toggle-panel')?.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'FOX_TOGGLE_PANEL' }).catch(() => {
      // If not on a supported page, open register page
      chrome.tabs.create({ url: 'https://seller-us.tiktok.com/account/register' });
    });
  }
  window.close();
});
