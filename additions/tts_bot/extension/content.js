// Fox-Auto Copilot - Ultra Fast-Copy & SSOT Document Hub
// Zero-Flake Pure 1-Click Copy, Pure OTP Resolver, Direct PDF Downloads & Auto-Profile Matching

(function() {
  // ==============================================================================
  // 1. SINGLETON GUARDS (Eliminate ALL duplicates across iframes, worlds & reloads)
  // ==============================================================================
  // Guard A: Strict Top-Level Frame Enforcement (Never inject UI into iframes)
  if (window.top !== window.self) {
    return;
  }

  // Guard B: In-Memory Context Guard
  if (window.__FOX_COPILOT_INJECTED__) {
    return;
  }
  window.__FOX_COPILOT_INJECTED__ = true;

  // Guard C: DOM-Level Host Cleanup (Purge any existing or stale hosts before mounting)
  const staleHosts = document.querySelectorAll("#fox-copilot-host, [data-fox-copilot-host]");
  staleHosts.forEach(el => el.remove());

  // Top-level frame verified. Maintain natural page viewport and screen dimensions.

  let BACKEND_BASE = localStorage.getItem("fox_backend_url") || "http://127.0.0.1:8787/api/copilot";
  let currentProfileId = localStorage.getItem("fox_selected_profile") || "BAM-34";
  let profileData = null;
  let isMinimized = false;

  function configureBackendUrl() {
    const current = localStorage.getItem("fox_backend_url") || BACKEND_BASE;
    const input = prompt("Nhập địa chỉ Backend Hub (Mặc định: http://127.0.0.1:8787/api/copilot hoặc link Cloudflare Tunnel https://...trycloudflare.com):", current);
    if (input !== null && input.trim()) {
      let clean = input.trim().replace(/\/$/, "");
      if (!clean.endsWith("/api/copilot")) clean += "/api/copilot";
      localStorage.setItem("fox_backend_url", clean);
      BACKEND_BASE = clean;
      initProfilesDropdown().then(() => loadProfileDetail(currentProfileId));
    }
  }

  // Safe backend proxy via Background Service Worker (Bypasses Mixed-Content & PNA)
  async function backendCall(pathOrUrl, options = {}) {
    const fullUrl = pathOrUrl.startsWith("http") ? pathOrUrl : `${BACKEND_BASE}${pathOrUrl}`;
    try {
      const res = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "FETCH_BACKEND",
          url: fullUrl,
          options: options
        }, (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!response || !response.success) {
            return reject(new Error(response?.error || `HTTP error ${response?.status || 'unknown'}`));
          }
          resolve(response.data);
        });
      });
      return res;
    } catch (err) {
      console.warn("[Copilot] Background fetch failed, attempting direct fetch:", err);
      const resp = await fetch(fullUrl, options);
      return await resp.json();
    }
  }

  // 1. Create Shadow DOM Host
  const host = document.createElement("div");
  host.id = "fox-copilot-host";
  host.setAttribute("data-fox-copilot-host", "active");
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  // On AdsPower start tab, show prominent quick launch pill
  if (window.location.hostname.includes("adspower.net")) {
    const pill = document.createElement("div");
    pill.style.cssText = "position:fixed;bottom:24px;right:24px;background:#0f172a;border:2px solid #3b82f6;border-radius:12px;padding:12px 18px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:13px;z-index:2147483647;box-shadow:0 10px 25px rgba(0,0,0,0.5);display:flex;align-items:center;gap:12px;";
    pill.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="display:inline-block;width:10px;height:10px;background:#10b981;border-radius:50%;box-shadow:0 0 8px #10b981;"></span>
        <span style="font-weight:700;color:#38bdf8;">Fox Copilot: Đã Sẵn Sàng!</span>
      </div>
      <button id="fox-quick-launch-btn" style="background:#2563eb;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-weight:600;font-size:12px;cursor:pointer;transition:all 0.15s;display:flex;align-items:center;gap:6px;">
        <span>🚀</span> Mở Form Đăng Ký TikTok Shop
      </button>
    `;
    shadow.appendChild(pill);
    shadow.getElementById("fox-quick-launch-btn")?.addEventListener("click", () => {
      window.location.href = "https://seller-us.tiktok.com/account/register";
    });
    return;
  }

  // Listen for popup toggle messages
  try {
    chrome.runtime?.onMessage?.addListener((msg) => {
      if (msg.type === "FOX_TOGGLE_PANEL") {
        const panel = shadow.getElementById("copilot-panel");
        const pill = shadow.getElementById("fox-reopen-pill");
        if (panel) {
          if (panel.style.display === "none") {
            panel.style.display = "block";
            if (pill) pill.style.display = "none";
            localStorage.removeItem("fox_copilot_closed");
          } else {
            panel.style.display = "none";
            if (pill) pill.style.display = "flex";
            localStorage.setItem("fox_copilot_closed", "true");
          }
        }
      }
    });
  } catch (e) {}

  // 2. Inject Styles into Shadow DOM
  const styleEl = document.createElement("style");
  styleEl.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    #copilot-panel {
      position: fixed;
      top: 14px;
      right: 14px;
      width: 360px;
      max-width: calc(100vw - 20px);
      max-height: calc(100vh - 28px);
      background: #090d16;
      color: #f1f5f9;
      border: 1px solid #1e293b;
      border-radius: 12px;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05);
      z-index: 2147483647;
      overflow: hidden;
      font-size: 12px;
      transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1), height 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      touch-action: none;
    }
    #copilot-panel.minimized {
      width: auto !important;
      min-width: 170px;
      max-width: 250px;
      height: 38px !important;
      border-radius: 19px !important;
      box-shadow: 0 6px 16px rgba(0,0,0,0.6);
      background: #0f172a;
      border: 1px solid #3b82f6;
    }
    #copilot-panel.minimized .body { display: none !important; }
    #copilot-panel.minimized .header {
      padding: 6px 12px;
      border-bottom: none;
      background: transparent;
      height: 38px;
    }
    @media (max-width: 500px) {
      #copilot-panel:not(.minimized) {
        top: 8px;
        right: 8px;
        left: 8px;
        width: auto;
        max-width: none;
        max-height: 88vh;
      }
    }
    .header {
      background: #0f172a;
      padding: 9px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #1e293b;
      cursor: grab;
      user-select: none;
    }
    .header:active { cursor: grabbing; }
    .title-row { display: flex; align-items: center; gap: 6px; }
    .status-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 10px;
      background: #10b981;
      color: white;
      white-space: nowrap;
    }
    .btn-icon {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 13px;
      padding: 2px 6px;
      border-radius: 4px;
      transition: all 0.15s;
    }
    .btn-icon:hover { color: #f8fafc; background: #334155; }
    .btn-icon.close { color: #ef4444; font-weight: 700; font-size: 14px; }
    .btn-icon.close:hover { color: #fff; background: #dc2626; }

    /* FLOATING REOPEN PILL */
    #fox-reopen-pill {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 42px;
      height: 42px;
      background: #0f172a;
      border: 2px solid #3b82f6;
      border-radius: 50%;
      color: #fff;
      display: none;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6);
      z-index: 2147483647;
      transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
      user-select: none;
    }
    #fox-reopen-pill:hover {
      transform: scale(1.1);
      border-color: #60a5fa;
      box-shadow: 0 12px 28px rgba(37,99,235,0.4);
    }
    .body {
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: calc(88vh - 44px);
      overflow-y: auto;
    }
    .section-title {
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #94a3b8;
      margin-bottom: 3px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card-box {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .otp-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .otp-code {
      font-family: monospace;
      font-size: 18px;
      font-weight: 800;
      color: #38bdf8;
      letter-spacing: 2.5px;
      background: #020617;
      padding: 2px 10px;
      border-radius: 6px;
      border: 1px solid #334155;
      min-width: 100px;
      text-align: center;
    }
    .btn-sm {
      background: #1e293b;
      border: 1px solid #334155;
      color: #e2e8f0;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .btn-sm:hover { background: #334155; color: #fff; }
    .btn-sm.primary { background: #2563eb; border-color: #3b82f6; color: #fff; }
    .btn-sm.primary:hover { background: #1d4ed8; }

    /* PURE COPY MATRIX */
    .copy-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
    }
    .copy-row-full {
      grid-column: span 2;
    }
    .copy-btn {
      background: #0f172a;
      border: 1px solid #1e293b;
      color: #cbd5e1;
      padding: 6px 8px;
      border-radius: 6px;
      font-size: 11px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      transition: all 0.15s ease;
      text-align: left;
      user-select: none;
    }
    .copy-btn:hover {
      background: #1e293b;
      border-color: #475569;
      color: #fff;
    }
    .copy-btn .lbl {
      color: #94a3b8;
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .copy-btn .val {
      font-weight: 600;
      color: #f1f5f9;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
      text-align: right;
    }
    .copy-btn.copied {
      background: #065f46 !important;
      border-color: #10b981 !important;
      color: #fff !important;
    }
    .copy-btn.copied .lbl, .copy-btn.copied .val {
      color: #fff !important;
    }

    /* DOWNLOAD BUTTONS */
    .dl-btn {
      background: #1e1b4b;
      border: 1px solid #4338ca;
      color: #e0e7ff;
      padding: 7px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.15s;
      text-decoration: none;
    }
    .dl-btn:hover {
      background: #312e81;
      border-color: #6366f1;
      color: #fff;
    }
    .dl-btn.bank {
      background: #064e3b;
      border-color: #059669;
      color: #ecfdf5;
    }
    .dl-btn.bank:hover {
      background: #047857;
      color: #fff;
    }

    select.profile-select {
      background: #020617;
      color: #f8fafc;
      border: 1px solid #3b82f6;
      border-radius: 6px;
      padding: 2px 6px;
      font-size: 11px;
      font-weight: 700;
      outline: none;
      max-width: 140px;
    }
    .watchdog-banner {
      background: #451a03;
      border: 1px solid #b45309;
      color: #fde68a;
      padding: 6px 10px;
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .watchdog-timer {
      font-family: monospace;
      font-size: 14px;
      font-weight: 800;
      color: #fbbf24;
    }
  `;
  shadow.appendChild(styleEl);

  // 3. Render Widget Shell
  const panel = document.createElement("div");
  panel.id = "copilot-panel";
  panel.innerHTML = `
    <div class="header" id="panel-header">
      <div class="title-row">
        <span>⚡</span>
        <select class="profile-select" id="select-profile">
          <option value="${currentProfileId}">${currentProfileId}</option>
        </select>
        <span class="status-badge" id="panel-status">READY</span>
      </div>
      <div style="display: flex; gap: 4px; align-items: center;">
        <button class="btn-icon" id="btn-refresh-profile" title="Nạp lại hồ sơ">🔄</button>
        <button class="btn-icon" id="btn-toggle-min" title="Thu nhỏ/Mở rộng">_</button>
        <button class="btn-icon close" id="btn-close-panel" title="Tắt Copilot hoàn toàn (Đóng)">✕</button>
      </div>
    </div>
    <div class="body">
      <!-- INFO BANNER -->
      <div style="background: #0f172a; padding: 7px 10px; border-radius: 8px; border: 1px solid #1e293b; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: 800; font-size: 13px; color: #fff;" id="txt-name">Đang tải...</div>
          <div style="font-size: 10px; color: #94a3b8;" id="txt-sub">Đang tự động nhận diện từ Profile AdsPower</div>
        </div>
        <span id="detected-tag" style="background: #1e293b; color: #38bdf8; font-size: 9.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; border: 1px solid #334155;">AUTO MATCH</span>
      </div>

      <!-- WATCHDOG LIVE RADAR (Hidden by default) -->
      <div class="watchdog-banner" id="box-watchdog" style="display: none;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span>⏱️</span>
          <span style="font-weight: 700; font-size: 11px;">Watchdog 6 Phút:</span>
        </div>
        <span class="watchdog-timer" id="txt-watchdog-countdown">06:00</span>
      </div>

      <!-- PURE OTP RESOLVER (ĐỌC & COPY MÃ TỨC THÌ) -->
      <div>
        <div class="section-title">🔑 ĐỌC MÃ OTP THUẦN TÚY</div>
        <div class="card-box">
          <!-- MAIL OTP -->
          <div class="otp-row">
            <span style="font-weight: 600; color: #e2e8f0;">📧 Mail OTP:</span>
            <span class="otp-code" id="code-mail">------</span>
            <div style="display: flex; gap: 4px;">
              <button class="btn-sm" id="btn-get-mail-otp">🔄 Đọc</button>
              <button class="btn-sm primary" id="btn-copy-mail-otp">📋 Copy</button>
            </div>
          </div>
          <!-- PHONE SMS -->
          <div class="otp-row" style="border-top: 1px solid #1e293b; padding-top: 6px;">
            <span style="font-weight: 600; color: #e2e8f0;">📱 SMS OTP:</span>
            <span class="otp-code" id="code-sms">------</span>
            <div style="display: flex; gap: 4px;">
              <button class="btn-sm" id="btn-get-sms-otp">🔄 Đọc</button>
              <button class="btn-sm primary" id="btn-copy-sms-otp">📋 Copy</button>
            </div>
          </div>
        </div>
      </div>

      <!-- PURE 1-CLICK FAST-COPY MATRIX -->
      <div>
        <div class="section-title">📋 NÚT COPY THUẦN TÚY (BẤM ĐỂ COPY)</div>
        <div class="copy-grid">
          <!-- EMAIL -->
          <div class="copy-btn copy-row-full" id="btn-copy-email">
            <span class="lbl">Email:</span>
            <span class="val" id="val-email">--</span>
          </div>
          <!-- PASS -->
          <div class="copy-btn copy-row-full" id="btn-copy-pass">
            <span class="lbl">Pass TTS:</span>
            <span class="val" id="val-pass">--</span>
          </div>

          <!-- NAME -->
          <div class="copy-btn" id="btn-copy-fname">
            <span class="lbl">Tên:</span>
            <span class="val" id="val-fname">--</span>
          </div>
          <div class="copy-btn" id="btn-copy-lname">
            <span class="lbl">Họ:</span>
            <span class="val" id="val-lname">--</span>
          </div>
          <div class="copy-btn copy-row-full" id="btn-copy-fullname">
            <span class="lbl">Cả họ tên:</span>
            <span class="val" id="val-fullname">--</span>
          </div>

          <!-- IDENTITY -->
          <div class="copy-btn" id="btn-copy-dob">
            <span class="lbl">DOB:</span>
            <span class="val" id="val-dob">--</span>
          </div>
          <div class="copy-btn" id="btn-copy-ssn">
            <span class="lbl">SSN:</span>
            <span class="val" id="val-ssn">--</span>
          </div>
          <div class="copy-btn" id="btn-copy-ein">
            <span class="lbl">EIN:</span>
            <span class="val" id="val-ein">--</span>
          </div>
          <div class="copy-btn" id="btn-copy-dl">
            <span class="lbl">DL#:</span>
            <span class="val" id="val-dl">--</span>
          </div>

          <!-- ADDRESS -->
          <div class="copy-btn copy-row-full" id="btn-copy-street">
            <span class="lbl">Đ/Chỉ:</span>
            <span class="val" id="val-street">--</span>
          </div>
          <div class="copy-btn" id="btn-copy-city">
            <span class="lbl">City:</span>
            <span class="val" id="val-city">--</span>
          </div>
          <div class="copy-btn" id="btn-copy-state">
            <span class="lbl">Bang:</span>
            <span class="val" id="val-state">--</span>
          </div>
          <div class="copy-btn" id="btn-copy-zip">
            <span class="lbl">Zip:</span>
            <span class="val" id="val-zip">--</span>
          </div>
          <div class="copy-btn" id="btn-copy-phone">
            <span class="lbl">Phone:</span>
            <span class="val" id="val-phone">--</span>
          </div>
        </div>
      </div>

      <!-- TẢI / MỞ FILE TỪ SHEET (DIRECT DOWNLOAD & PATHS) -->
      <div>
        <div class="section-title">📁 TÀI LIỆU SHEET & DRIVER LICENSE</div>
        <div style="display: flex; flex-direction: column; gap: 5px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
            <button class="dl-btn" id="btn-download-ein">📄 Tải EIN (CP575)</button>
            <button class="dl-btn bank" id="btn-download-bank">🏦 Tải Sao Kê Bank</button>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
            <button class="btn-sm" id="btn-copy-path-front" style="padding: 6px;">🪪 Copy Path Ảnh Trước</button>
            <button class="btn-sm" id="btn-copy-path-back" style="padding: 6px;">🪪 Copy Path Ảnh Sau</button>
          </div>
          <div id="archive-status-container"></div>
        </div>
      </div>
    </div>
  `;
  shadow.appendChild(panel);

  // Floating Reopen Trigger Pill
  const reopenPill = document.createElement("div");
  reopenPill.id = "fox-reopen-pill";
  reopenPill.title = "Mở lại Fox Copilot";
  reopenPill.innerHTML = `<span>⚡</span>`;
  shadow.appendChild(reopenPill);

  // Function: Hide completely / Show panel
  function closeCopilotPanel() {
    panel.style.display = "none";
    reopenPill.style.display = "flex";
    localStorage.setItem("fox_copilot_closed", "true");
  }

  function openCopilotPanel() {
    panel.style.display = "block";
    reopenPill.style.display = "none";
    localStorage.removeItem("fox_copilot_closed");
  }

  // Restore closed state if previously closed by user
  if (localStorage.getItem("fox_copilot_closed") === "true") {
    closeCopilotPanel();
  }

  // Reopen Pill Click Handler
  reopenPill.addEventListener("click", () => {
    openCopilotPanel();
  });

  // Close Button Click Handler
  const btnClose = shadow.getElementById("btn-close-panel");
  if (btnClose) {
    btnClose.addEventListener("click", (e) => {
      e.stopPropagation();
      closeCopilotPanel();
    });
  }

  // 4. Panel Minimizing & Dragging
  const btnMin = shadow.getElementById("btn-toggle-min");
  btnMin.addEventListener("click", (e) => {
    e.stopPropagation();
    isMinimized = !isMinimized;
    panel.classList.toggle("minimized", isMinimized);
    btnMin.textContent = isMinimized ? "+" : "_";
  });

  // Smooth Dragging on Header
  let isDragging = false;
  let startX = 0, startY = 0, initLeft = 0, initTop = 0;
  const headerEl = shadow.getElementById("panel-header");

  headerEl.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "SELECT" || e.target.tagName === "BUTTON" || e.target.closest("button") || e.target.closest("select")) {
      return;
    }
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = panel.getBoundingClientRect();
    initLeft = rect.left;
    initTop = rect.top;
    panel.style.right = "auto";
    panel.style.left = `${initLeft}px`;
    panel.style.top = `${initTop}px`;
    panel.style.transition = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);
    panel.style.left = `${Math.min(maxLeft, Math.max(0, initLeft + dx))}px`;
    panel.style.top = `${Math.min(maxTop, Math.max(0, initTop + dy))}px`;
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      panel.style.transition = "width 0.2s, height 0.2s";
    }
  });

  // 5. Fast Copy Helper with Instant Visual Feedback
  function copyText(text, containerEl) {
    if (!text || text === "--") return;
    navigator.clipboard.writeText(text).then(() => {
      if (containerEl) {
        containerEl.classList.add("copied");
        const valSpan = containerEl.querySelector(".val");
        const origVal = valSpan ? valSpan.textContent : containerEl.textContent;
        if (valSpan) valSpan.textContent = "✓ ĐÃ COPY!";
        setTimeout(() => {
          containerEl.classList.remove("copied");
          if (valSpan) valSpan.textContent = origVal;
        }, 1200);
      }
    });
  }

  // 6. Load Profile Detail from Fox-Auto Backend
  async function loadProfileDetail(pid, detectedName = null) {
    try {
      // Sync select dropdown immediately
      const select = shadow.getElementById("select-profile");
      if (select) {
        let opt = select.querySelector(`option[value="${pid}"]`);
        if (!opt) {
          opt = document.createElement("option");
          opt.value = pid;
          opt.textContent = `${pid} (Active)`;
          select.prepend(opt);
        }
        select.value = pid;
      }

      if (detectedName) {
        shadow.getElementById("txt-name").textContent = detectedName;
      }

      const url = `${BACKEND_BASE}/profile/${pid}` + (detectedName ? `?name=${encodeURIComponent(detectedName)}` : "");
      const data = await backendCall(url);
      if (data && data.code === 200 && data.profile) {
        profileData = data.profile;
        const live = data.live_state || {};

        // Top info
        shadow.getElementById("txt-name").textContent = profileData.name || pid;
        shadow.getElementById("txt-sub").textContent = `${profileData.state || ""} • ${profileData.email || ""} • SĐT: ${profileData.phone || "--"}`;
        shadow.getElementById("panel-status").textContent = live.status || "READY";

        // Bind copy values to buttons
        const setCopyBtn = (btnId, valId, value) => {
          const valEl = shadow.getElementById(valId);
          const btnEl = shadow.getElementById(btnId);
          if (valEl) valEl.textContent = value || "--";
          if (btnEl) btnEl.onclick = () => copyText(value, btnEl);
        };

        setCopyBtn("btn-copy-email", "val-email", profileData.email);
        setCopyBtn("btn-copy-pass", "val-pass", profileData.shop_pass);
        setCopyBtn("btn-copy-fname", "val-fname", profileData.first_name);
        setCopyBtn("btn-copy-lname", "val-lname", profileData.last_name);
        setCopyBtn("btn-copy-fullname", "val-fullname", profileData.name);
        setCopyBtn("btn-copy-dob", "val-dob", profileData.dob);
        setCopyBtn("btn-copy-ssn", "val-ssn", profileData.ssn);
        setCopyBtn("btn-copy-ein", "val-ein", profileData.ein);
        setCopyBtn("btn-copy-dl", "val-dl", profileData.dl);
        setCopyBtn("btn-copy-street", "val-street", profileData.address);
        setCopyBtn("btn-copy-city", "val-city", profileData.city);
        setCopyBtn("btn-copy-state", "val-state", profileData.state);
        setCopyBtn("btn-copy-zip", "val-zip", profileData.zip);
        setCopyBtn("btn-copy-phone", "val-phone", profileData.phone);

        // Pre-fill cached mail OTP if available
        if (profileData.cached_mail_otp) {
          const codeMail = shadow.getElementById("code-mail");
          if (codeMail) codeMail.textContent = profileData.cached_mail_otp;
        }

        // Direct Download Buttons (Routed safely via background.js)
        const btnDlEin = shadow.getElementById("btn-download-ein");
        if (btnDlEin) {
          btnDlEin.onclick = () => {
            chrome.runtime.sendMessage({
              action: "OPEN_URL",
              url: `${BACKEND_BASE}/download/${currentProfileId}/ein`
            });
          };
        }

        const btnDlBank = shadow.getElementById("btn-download-bank");
        if (btnDlBank) {
          btnDlBank.onclick = () => {
            chrome.runtime.sendMessage({
              action: "OPEN_URL",
              url: `${BACKEND_BASE}/download/${currentProfileId}/bank`
            });
          };
        }

        // Copy Path Buttons
        const btnCopyFront = shadow.getElementById("btn-copy-path-front");
        if (btnCopyFront) {
          btnCopyFront.onclick = () => {
            const frontPath = profileData.files?.front || `D:\\Download\\FL_FRONT_${pid}_${profileData.name.replace(/ /g, '_')}.jpg`;
            navigator.clipboard.writeText(frontPath).then(() => {
              const orig = btnCopyFront.textContent;
              btnCopyFront.textContent = "✓ ĐÃ COPY PATH!";
              setTimeout(() => { btnCopyFront.textContent = orig; }, 1200);
            });
          };
        }

        const btnCopyBack = shadow.getElementById("btn-copy-path-back");
        if (btnCopyBack) {
          btnCopyBack.onclick = () => {
            const backPath = profileData.files?.back || `D:\\Download\\FL_BACK_${pid}_${profileData.name.replace(/ /g, '_')}.jpg`;
            navigator.clipboard.writeText(backPath).then(() => {
              const orig = btnCopyBack.textContent;
              btnCopyBack.textContent = "✓ ĐÃ COPY PATH!";
              setTimeout(() => { btnCopyBack.textContent = orig; }, 1200);
            });
          };
        }
      }
    } catch (e) {
      console.error("[Copilot] Error loading profile detail:", e);
      const sub = shadow.getElementById("txt-sub");
      if (sub) {
        sub.innerHTML = '<span style="color:#f87171; cursor:pointer; text-decoration:underline;" title="Click để cấu hình link Backend Tunnel">⚠️ Mất kết nối Hub (Click để cấu hình URL)</span>';
        sub.onclick = configureBackendUrl;
      }
    }
  }

  // 7. Load All Profiles for Dropdown (Deduplicated)
  async function initProfilesDropdown() {
    try {
      const data = await backendCall("/profiles");
      if (data && data.code === 200 && Array.isArray(data.profiles)) {
        const select = shadow.getElementById("select-profile");
        if (!select) return;

        const seen = new Set();
        const uniqueProfiles = data.profiles.filter(p => {
          if (!p.id || seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });

        // Ensure currentProfileId is in the list
        if (!seen.has(currentProfileId)) {
          uniqueProfiles.unshift({ id: currentProfileId, state: "" });
        }

        select.innerHTML = uniqueProfiles.map(p => 
          `<option value="${p.id}" ${p.id === currentProfileId ? "selected" : ""}>${p.id} ${p.state ? '('+p.state+')' : ''}</option>`
        ).join("");

        select.onchange = (e) => {
          currentProfileId = e.target.value;
          localStorage.setItem("fox_selected_profile", currentProfileId);
          loadProfileDetail(currentProfileId);
        };
      }
    } catch (e) {
      console.error("[Copilot] Error initializing profiles:", e);
    }
  }

  // 8. Refresh Button Handler
  shadow.getElementById("btn-refresh-profile")?.addEventListener("click", () => {
    initProfilesDropdown().then(() => loadProfileDetail(currentProfileId));
  });

  // 9. OTP Read & Copy Handlers
  shadow.getElementById("btn-get-mail-otp")?.addEventListener("click", async () => {
    const codeEl = shadow.getElementById("code-mail");
    if (codeEl) codeEl.textContent = "...";
    try {
      const data = await backendCall(`/otp/${currentProfileId}?otp_type=mail`);
      if (codeEl) codeEl.textContent = data?.mail_otp || "Chưa có";
    } catch (e) {
      if (codeEl) codeEl.textContent = "Lỗi";
    }
  });

  shadow.getElementById("btn-copy-mail-otp")?.addEventListener("click", () => {
    const code = shadow.getElementById("code-mail")?.textContent;
    if (code && code !== "------" && code !== "..." && code !== "Lỗi" && code !== "Chưa có") {
      navigator.clipboard.writeText(code).then(() => {
        const btn = shadow.getElementById("btn-copy-mail-otp");
        if (btn) {
          const orig = btn.textContent;
          btn.textContent = "✓";
          setTimeout(() => { btn.textContent = orig; }, 1200);
        }
      });
    }
  });

  shadow.getElementById("btn-get-sms-otp")?.addEventListener("click", async () => {
    const codeEl = shadow.getElementById("code-sms");
    if (codeEl) codeEl.textContent = "...";
    try {
      const data = await backendCall(`/otp/${currentProfileId}?otp_type=sms`);
      if (codeEl) codeEl.textContent = data?.sms_otp || "Chưa có";
    } catch (e) {
      if (codeEl) codeEl.textContent = "Lỗi";
    }
  });

  shadow.getElementById("btn-copy-sms-otp")?.addEventListener("click", () => {
    const code = shadow.getElementById("code-sms")?.textContent;
    if (code && code !== "------" && code !== "..." && code !== "Lỗi" && code !== "Chưa có") {
      navigator.clipboard.writeText(code).then(() => {
        const btn = shadow.getElementById("btn-copy-sms-otp");
        if (btn) {
          const orig = btn.textContent;
          btn.textContent = "✓";
          setTimeout(() => { btn.textContent = orig; }, 1200);
        }
      });
    }
  });

  // 10. Auto-Archive File Upload Interceptor (Registered once per document)
  if (!document.__FOX_AUTO_LISTENERS_BOUND__) {
    document.__FOX_AUTO_LISTENERS_BOUND__ = true;

    document.addEventListener("change", async (event) => {
      const target = event.target;
      if (target && target.tagName === "INPUT" && target.type === "file" && target.files && target.files.length > 0) {
        for (const file of target.files) {
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const b64 = reader.result.split(",")[1];
              const rjson = await backendCall("/archive_upload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  record_id: currentProfileId,
                  file_name: file.name,
                  file_size: file.size,
                  file_type: file.type,
                  file_base64: b64,
                  round: 1
                })
              });
              if (rjson && rjson.code === 200) {
                const box = shadow.getElementById("archive-status-container");
                if (box) box.innerHTML = `<span style="font-size: 10px; color: #34d399; background: #064e3b; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-top: 4px;">💾 Đã sao lưu: ${file.name.slice(0, 22)}...</span>`;
              }
            } catch (err) {
              console.error("[Archive Interceptor] Failed:", err);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    }, true);

    // 11. Submit Button Observer -> Triggers 6-Minute Watchdog
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const text = (btn.innerText || "").toLowerCase();
      if (text.includes("submit") || text.includes("review application")) {
        console.log("[Copilot] User clicked Submit! Arming 6-minute Watchdog...");
        arm6MinWatchdog();
      }
    }, true);
  }

  function arm6MinWatchdog() {
    const box = shadow.getElementById("box-watchdog");
    if (box) box.style.display = "flex";
    chrome.runtime?.sendMessage?.({
      action: "START_6MIN_WATCHDOG",
      profileId: currentProfileId
    });
  }

  // 12. Watchdog Radar Listener
  try {
    chrome.runtime?.onMessage?.addListener((msg, sender, sendResponse) => {
      if (msg.action === "WATCHDOG_TICK") {
        const remaining = msg.remainingSeconds;
        const m = Math.floor(remaining / 60).toString().padStart(2, "0");
        const s = (remaining % 60).toString().padStart(2, "0");
        const timerEl = shadow.getElementById("txt-watchdog-countdown");
        if (timerEl) timerEl.textContent = `${m}:${s}`;

        const pageText = document.body.innerText || "";
        let verdict = null;

        if (pageText.includes("Edit application") || pageText.includes("Changes requested") || pageText.includes("Action required")) {
          verdict = "EDIT_AVAILABLE";
          const statusEl = shadow.getElementById("panel-status");
          if (statusEl) {
            statusEl.textContent = "EDIT AVAIL";
            statusEl.style.background = "#10b981";
          }
        } else if (pageText.includes("Appeal") || pageText.includes("appeal") || pageText.includes("Suspended")) {
          verdict = "APPEAL_TRIGGERED";
          const statusEl = shadow.getElementById("panel-status");
          if (statusEl) {
            statusEl.textContent = "DEAD - APPEAL";
            statusEl.style.background = "#e11d48";
          }
        } else if (pageText.includes("Your shop is approved") || pageText.includes("Active")) {
          verdict = "APPROVED";
          const statusEl = shadow.getElementById("panel-status");
          if (statusEl) {
            statusEl.textContent = "APPROVED";
            statusEl.style.background = "#8b5cf6";
          }
        }

        if (verdict) {
          chrome.runtime?.sendMessage?.({
            action: "SYNC_DOM_STATE",
            payload: {
              record_id: currentProfileId,
              status: verdict,
              sub_status: "Detected from DOM Watchdog"
            }
          });
        }

        sendResponse({ status: verdict });
      }
    });
  } catch (e) {}

  // 13. AUTO-DETECT ACTIVE PROFILE FROM TABS / WINDOW
  try {
    chrome.runtime?.sendMessage?.({ action: "DETECT_ACTIVE_PROFILE" }, (res) => {
      let detectedName = null;
      if (res && res.detectedId) {
        console.log("[Fox Copilot] Auto-detected Profile from browser tab/window:", res.detectedId, res.detectedName);
        currentProfileId = res.detectedId;
        detectedName = res.detectedName;
        localStorage.setItem("fox_selected_profile", currentProfileId);

        // 1. Force update dropdown immediately so it never stays stuck on wrong profile
        const select = shadow.getElementById("select-profile");
        if (select) {
          select.innerHTML = `<option value="${currentProfileId}" selected>${currentProfileId} (Đang mở)</option>`;
          select.value = currentProfileId;
        }

        // 2. Update status tag
        const tag = shadow.getElementById("detected-tag");
        if (tag) {
          tag.textContent = `KHỚP: ${currentProfileId}`;
          tag.style.background = "#065f46";
          tag.style.color = "#34d399";
          tag.onclick = () => { loadProfileDetail(currentProfileId, detectedName); };
        }
      }
      // Initialize Dropdown & Load Data with detectedName
      initProfilesDropdown().then(() => loadProfileDetail(currentProfileId, detectedName));
    });
  } catch (e) {
    initProfilesDropdown().then(() => loadProfileDetail(currentProfileId));
  }
})();
