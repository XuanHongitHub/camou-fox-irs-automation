// Fox-Auto Copilot & 6-Minute Watchdog - Content Script
// Injected into TikTok Seller tabs with Shadow DOM Isolation & Real-Time Sync Bus

(function() {
  if (window.__FOX_COPILOT_INJECTED__) return;
  window.__FOX_COPILOT_INJECTED__ = true;

  // 0. Auto-lock Mobile Viewport (Never lose mobile layout on new tabs)
  try {
    let vpMeta = document.querySelector('meta[name="viewport"]');
    if (!vpMeta) {
      vpMeta = document.createElement('meta');
      vpMeta.name = 'viewport';
      (document.head || document.documentElement).appendChild(vpMeta);
    }
    vpMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
  } catch (e) {}

  const BACKEND_BASE = "http://127.0.0.1:8787/api/copilot";
  let currentProfileId = localStorage.getItem("fox_selected_profile") || "AM-01";
  let profileData = null;
  let isMinimized = false;
  let remainingWatchdogSeconds = 0;
  let watchdogInterval = null;

  // 1. Create Shadow DOM Host
  const host = document.createElement("div");
  host.id = "fox-copilot-host";
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  // On AdsPower start tab, show prominent quick launch pill
  if (window.location.hostname.includes("adspower.net")) {
    const pill = document.createElement("div");
    pill.style.cssText = "position:fixed;bottom:24px;right:24px;background:#0f172a;border:2px solid #3b82f6;border-radius:12px;padding:12px 18px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:13px;z-index:2147483647;box-shadow:0 10px 25px rgba(0,0,0,0.5);display:flex;align-items:center;gap:12px;";
    pill.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="display:inline-block;width:10px;height:10px;background:#10b981;border-radius:50%;box-shadow:0 0 8px #10b981;"></span>
        <span style="font-weight:700;color:#38bdf8;">Fox Copilot: Đã Tự Động Nạp!</span>
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

  // Listen for popup messages
  try {
    chrome.runtime?.onMessage?.addListener((msg) => {
      if (msg.type === "FOX_TOGGLE_PANEL") {
        const panel = shadow.getElementById("copilot-panel");
        if (panel) {
          panel.classList.toggle("minimized");
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
      top: 20px;
      right: 20px;
      width: 360px;
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #334155;
      border-radius: 14px;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5);
      z-index: 2147483647;
      overflow: hidden;
      font-size: 12px;
      transition: width 0.2s, height 0.2s;
    }
    #copilot-panel.minimized {
      width: 220px;
      height: 44px;
    }
    .header {
      background: #1e293b;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #334155;
      cursor: grab;
      user-select: none;
    }
    .header:active { cursor: grabbing; }
    .title-row { display: flex; align-items: center; gap: 8px; }
    .badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 6px;
      background: #3b82f6;
      color: white;
    }
    .status-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 12px;
      background: #10b981;
      color: white;
    }
    .btn-icon {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 14px;
      padding: 2px;
    }
    .btn-icon:hover { color: #f8fafc; }
    .body {
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: 85vh;
      overflow-y: auto;
    }
    .minimized .body { display: none; }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #94a3b8;
      margin-bottom: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .btn-action {
      background: #1e293b;
      border: 1px solid #334155;
      color: #e2e8f0;
      padding: 7px 10px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 11px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.15s;
    }
    .btn-action:hover {
      background: #2563eb;
      border-color: #3b82f6;
      color: white;
    }
    .btn-action.primary {
      background: #2563eb;
      border-color: #3b82f6;
      color: white;
    }
    .btn-action.primary:hover { background: #1d4ed8; }
    .card-box {
      background: #1e293b;
      border: 1px solid #334155;
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
    }
    .otp-code {
      font-family: monospace;
      font-size: 14px;
      font-weight: 700;
      color: #38bdf8;
      background: #0f172a;
      padding: 3px 8px;
      border-radius: 6px;
      border: 1px dashed #0284c7;
    }
    .fast-copy-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
    }
    .pill {
      background: #0f172a;
      border: 1px solid #334155;
      color: #cbd5e1;
      padding: 4px 6px;
      border-radius: 6px;
      font-size: 10px;
      cursor: pointer;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: all 0.15s;
    }
    .pill:hover {
      background: #334155;
      color: white;
      border-color: #64748b;
    }
    .pill.copied {
      background: #10b981 !important;
      color: white !important;
      border-color: #059669 !important;
    }
    .watchdog-banner {
      background: #451a03;
      border: 1px solid #b45309;
      color: #fde68a;
      padding: 8px 10px;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .watchdog-timer {
      font-family: monospace;
      font-size: 15px;
      font-weight: 800;
      color: #fbbf24;
    }
    select.profile-select {
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #475569;
      border-radius: 6px;
      padding: 3px 6px;
      font-size: 11px;
      outline: none;
    }
    .archive-tag {
      font-size: 10px;
      color: #34d399;
      background: #064e3b;
      padding: 2px 6px;
      border-radius: 4px;
      display: inline-block;
      margin-top: 4px;
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
      <div style="display: flex; gap: 6px;">
        <button class="btn-icon" id="btn-toggle-min" title="Thu nhỏ/Mở rộng">_</button>
      </div>
    </div>
    <div class="body">
      <!-- INFO BANNER -->
      <div style="background: #1e293b; padding: 6px 10px; border-radius: 6px; border: 1px solid #334155;">
        <div style="font-weight: 700; color: #fff;" id="txt-name">Đang tải...</div>
        <div style="font-size: 10px; color: #94a3b8;" id="txt-sub">Đang đồng bộ từ Fox-Auto Backend :8787</div>
      </div>

      <!-- WATCHDOG LIVE RADAR -->
      <div class="watchdog-banner" id="box-watchdog" style="display: none;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 700;">⏱️ WATCHDOG 6 PHÚT:</span>
          <span class="watchdog-timer" id="txt-watchdog-countdown">06:00</span>
        </div>
        <div style="font-size: 10px;">Quét kết quả 10s/lần • Tự động đóng tab phụ</div>
      </div>

      <!-- 1-CLICK AUTOFILL -->
      <div>
        <div class="section-title">⚡ ĐIỀN FORM TỰ ĐỘNG</div>
        <div class="grid-2">
          <button class="btn-action primary" id="btn-fill-step1">📝 Bước 1 (Mail+Pass)</button>
          <button class="btn-action primary" id="btn-fill-step2">🏢 Bước 2 (Sole Prop)</button>
        </div>
        <div style="margin-top: 6px;">
          <button class="btn-action" style="width: 100%;" id="btn-fill-address">📍 Điền Riêng Địa Chỉ (Street/City/Zip)</button>
        </div>
      </div>

      <!-- OTP RESOLVER -->
      <div>
        <div class="section-title">🔑 LẤY MÃ OTP TỨC THÌ</div>
        <div class="card-box">
          <div class="otp-row">
            <span>📧 Mail OTP:</span>
            <span class="otp-code" id="code-mail">------</span>
            <div style="display: flex; gap: 4px;">
              <button class="btn-action" id="btn-get-mail-otp">🔄 Lấy</button>
              <button class="btn-action" id="btn-fill-mail-otp">Điền</button>
            </div>
          </div>
          <div class="otp-row" style="border-top: 1px solid #334155; padding-top: 6px;">
            <span>📱 Phone SMS:</span>
            <span class="otp-code" id="code-sms">------</span>
            <div style="display: flex; gap: 4px;">
              <button class="btn-action" id="btn-get-sms-otp">🔄 Lấy</button>
              <button class="btn-action" id="btn-fill-sms-otp">Điền</button>
            </div>
          </div>
        </div>
      </div>

      <!-- FAST COPY PILLS -->
      <div>
        <div class="section-title">📋 KHAY FAST-COPY (BẤM ĐỂ COPY)</div>
        <div class="fast-copy-grid">
          <div class="pill" id="pill-name" title="Họ tên">Họ Tên</div>
          <div class="pill" id="pill-dob" title="Ngày sinh">DOB</div>
          <div class="pill" id="pill-ssn" title="SSN">SSN</div>
          <div class="pill" id="pill-ein" title="EIN">EIN</div>
          <div class="pill" id="pill-street" title="Địa chỉ">Đ/Chỉ</div>
          <div class="pill" id="pill-city" title="Thành phố">City</div>
          <div class="pill" id="pill-state" title="Bang">Bang</div>
          <div class="pill" id="pill-zip" title="Mã Zip">Zip</div>
          <div class="pill" id="pill-pass" title="Mật khẩu TikTok">Pass</div>
        </div>
      </div>

      <!-- UPLOAD & ASSETS -->
      <div>
        <div class="section-title">📁 TỆP TIN & DRIVER LICENSE</div>
        <div class="card-box">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span>DL#: <strong id="txt-dl" style="color: #38bdf8;">--</strong></span>
            <button class="btn-action" id="btn-copy-dl" style="padding: 2px 6px;">Copy</button>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #334155; padding-top: 4px;">
            <span>Ảnh Trước / Sau:</span>
            <button class="btn-action" id="btn-copy-front-path" style="padding: 2px 6px;">Copy Path</button>
          </div>
          <div id="archive-status-container"></div>
        </div>
      </div>
    </div>
  `;
  shadow.appendChild(panel);

  // 4. Panel Minimizing & Dragging
  const btnMin = shadow.getElementById("btn-toggle-min");
  btnMin.addEventListener("click", () => {
    isMinimized = !isMinimized;
    panel.classList.toggle("minimized", isMinimized);
    btnMin.textContent = isMinimized ? "+" : "_";
  });

  // 5. Native Value Setter (React Fiber Compatible)
  function setReactInputValue(input, value) {
    if (!input) return;
    input.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set ||
                         Object.getOwnPropertyDescriptor(input.__proto__, "value")?.set;
    if (nativeSetter) {
      nativeSetter.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  // 6. Fast Copy Helper
  function copyText(text, el) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      if (el) {
        el.classList.add("copied");
        const orig = el.textContent;
        el.textContent = "✓ Copy";
        setTimeout(() => {
          el.classList.remove("copied");
          el.textContent = orig;
        }, 1200);
      }
    });
  }

  // 7. Load Profile Detail from Fox-Auto Backend
  async function loadProfileDetail(pid) {
    try {
      const res = await fetch(`${BACKEND_BASE}/profile/${pid}`);
      const data = await res.json();
      if (data.code === 200) {
        profileData = data.profile;
        const live = data.live_state || {};
        shadow.getElementById("txt-name").textContent = profileData.name || pid;
        shadow.getElementById("txt-sub").textContent = `${profileData.state} • ${profileData.email}`;
        shadow.getElementById("panel-status").textContent = live.status || "READY";
        shadow.getElementById("txt-dl").textContent = profileData.dl || "Auto Regex";

        // Bind copy pills
        shadow.getElementById("pill-name").onclick = (e) => copyText(profileData.name, e.target);
        shadow.getElementById("pill-dob").onclick = (e) => copyText(profileData.dob, e.target);
        shadow.getElementById("pill-ssn").onclick = (e) => copyText(profileData.ssn, e.target);
        shadow.getElementById("pill-ein").onclick = (e) => copyText(profileData.ein, e.target);
        shadow.getElementById("pill-street").onclick = (e) => copyText(profileData.address, e.target);
        shadow.getElementById("pill-city").onclick = (e) => copyText(profileData.city, e.target);
        shadow.getElementById("pill-state").onclick = (e) => copyText(profileData.state, e.target);
        shadow.getElementById("pill-zip").onclick = (e) => copyText(profileData.zip, e.target);
        shadow.getElementById("pill-pass").onclick = (e) => copyText(profileData.shop_pass, e.target);

        shadow.getElementById("btn-copy-dl").onclick = () => copyText(profileData.dl || "D542-540-90-041-0", null);
        shadow.getElementById("btn-copy-front-path").onclick = () => copyText(profileData.files.front, null);
      }
    } catch (e) {
      console.error("[Copilot] Error loading profile detail:", e);
    }
  }

  // 8. Load All Profiles for Dropdown
  async function initProfilesDropdown() {
    try {
      const res = await fetch(`${BACKEND_BASE}/profiles`);
      const data = await res.json();
      if (data.code === 200) {
        const select = shadow.getElementById("select-profile");
        select.innerHTML = data.profiles.map(p => `<option value="${p.id}" ${p.id === currentProfileId ? "selected" : ""}>${p.id} (${p.state})</option>`).join("");
        select.addEventListener("change", (e) => {
          currentProfileId = e.target.value;
          localStorage.setItem("fox_selected_profile", currentProfileId);
          loadProfileDetail(currentProfileId);
        });
      }
    } catch (e) {
      console.error("[Copilot] Error initializing profiles:", e);
    }
  }

  // 9. Autofill Implementations
  shadow.getElementById("btn-fill-step1").addEventListener("click", () => {
    if (!profileData) return;
    const emailInput = document.querySelector('input[type="email"], input[placeholder*="email" i], input[name*="email" i]');
    const passInput = document.querySelector('input[type="password"], input[placeholder*="password" i]');
    if (emailInput && profileData.email) setReactInputValue(emailInput, profileData.email);
    if (passInput && profileData.shop_pass) setReactInputValue(passInput, profileData.shop_pass);
  });

  shadow.getElementById("btn-fill-step2").addEventListener("click", () => {
    if (!profileData) return;
    // Names
    const fNameInput = document.querySelector('input[placeholder*="First name" i], input[name*="firstName" i]');
    const lNameInput = document.querySelector('input[placeholder*="Last name" i], input[name*="lastName" i]');
    if (fNameInput) setReactInputValue(fNameInput, profileData.first_name);
    if (lNameInput) setReactInputValue(lNameInput, profileData.last_name);

    // SSN / EIN
    const ssnInput = document.querySelector('input[placeholder*="SSN" i], input[placeholder*="Social" i]');
    if (ssnInput) setReactInputValue(ssnInput, profileData.ssn);

    const einInput = document.querySelector('input[placeholder*="EIN" i], input[placeholder*="Tax" i]');
    if (einInput && profileData.ein) setReactInputValue(einInput, profileData.ein);

    // Business Name
    const bizInput = document.querySelector('input[placeholder*="Company" i], input[placeholder*="Business" i], input[placeholder*="Legal name" i]');
    if (bizInput) setReactInputValue(bizInput, profileData.name);

    // Address
    fillAddressDOM();
  });

  function fillAddressDOM() {
    if (!profileData) return;
    const streetInput = document.querySelector('input[placeholder*="Street" i], input[placeholder*="Address" i], input[name*="address" i]');
    const cityInput = document.querySelector('input[placeholder*="City" i], input[name*="city" i]');
    const zipInput = document.querySelector('input[placeholder*="Zip" i], input[placeholder*="Postal" i], input[name*="zip" i]');
    if (streetInput) setReactInputValue(streetInput, profileData.address);
    if (cityInput) setReactInputValue(cityInput, profileData.city);
    if (zipInput) setReactInputValue(zipInput, profileData.zip);
  }

  shadow.getElementById("btn-fill-address").addEventListener("click", fillAddressDOM);

  // 10. OTP Actions
  shadow.getElementById("btn-get-mail-otp").addEventListener("click", async () => {
    shadow.getElementById("code-mail").textContent = "...";
    try {
      const res = await fetch(`${BACKEND_BASE}/otp/${currentProfileId}?otp_type=mail`);
      const data = await res.json();
      shadow.getElementById("code-mail").textContent = data.mail_otp || "Chưa có";
    } catch (e) {
      shadow.getElementById("code-mail").textContent = "Lỗi";
    }
  });

  shadow.getElementById("btn-fill-mail-otp").addEventListener("click", () => {
    const code = shadow.getElementById("code-mail").textContent;
    if (code && code.length === 6 && !isNaN(code)) {
      const otpInputs = document.querySelectorAll('input[type="text"][maxlength="1"], input[placeholder*="code" i], input[name*="code" i]');
      if (otpInputs.length === 6) {
        otpInputs.forEach((inp, idx) => setReactInputValue(inp, code[idx]));
      } else if (otpInputs.length > 0) {
        setReactInputValue(otpInputs[0], code);
      }
    }
  });

  shadow.getElementById("btn-get-sms-otp").addEventListener("click", async () => {
    shadow.getElementById("code-sms").textContent = "...";
    try {
      const res = await fetch(`${BACKEND_BASE}/otp/${currentProfileId}?otp_type=sms`);
      const data = await res.json();
      shadow.getElementById("code-sms").textContent = data.sms_otp || "Chưa có";
    } catch (e) {
      shadow.getElementById("code-sms").textContent = "Lỗi";
    }
  });

  shadow.getElementById("btn-fill-sms-otp").addEventListener("click", () => {
    const code = shadow.getElementById("code-sms").textContent;
    if (code && code.length === 6 && !isNaN(code)) {
      const otpInput = document.querySelector('input[placeholder*="SMS" i], input[placeholder*="verification code" i]');
      if (otpInput) setReactInputValue(otpInput, code);
    }
  });

  // 11. Auto-Archive File Upload Interceptor
  document.addEventListener("change", async (event) => {
    const target = event.target;
    if (target && target.tagName === "INPUT" && target.type === "file" && target.files && target.files.length > 0) {
      for (const file of target.files) {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const b64 = reader.result.split(",")[1];
            const resp = await fetch(`${BACKEND_BASE}/archive_upload`, {
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
            const rjson = await resp.json();
            if (rjson.code === 200) {
              const box = shadow.getElementById("archive-status-container");
              box.innerHTML = `<span class="archive-tag">💾 Đã sao lưu: ${file.name.slice(0, 22)}...</span>`;
            }
          } catch (err) {
            console.error("[Archive Interceptor] Failed:", err);
          }
        };
        reader.readAsDataURL(file);
      }
    }
  }, true);

  // 12. Submit Button Observer -> Triggers 6-Minute Watchdog
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const text = (btn.innerText || "").toLowerCase();
    if (text.includes("submit") || text.includes("review application")) {
      console.log("[Copilot] User clicked Submit! Arming 6-minute Watchdog...");
      arm6MinWatchdog();
    }
  }, true);

  function arm6MinWatchdog() {
    shadow.getElementById("box-watchdog").style.display = "block";
    chrome.runtime.sendMessage({
      action: "START_6MIN_WATCHDOG",
      profileId: currentProfileId
    });
  }

  // 13. Watchdog Radar Listener
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "WATCHDOG_TICK") {
      const remaining = msg.remainingSeconds;
      const m = Math.floor(remaining / 60).toString().padStart(2, "0");
      const s = (remaining % 60).toString().padStart(2, "0");
      shadow.getElementById("txt-watchdog-countdown").textContent = `${m}:${s}`;

      // Scan DOM for status verdict
      const pageText = document.body.innerText || "";
      let verdict = null;

      if (pageText.includes("Edit application") || pageText.includes("Changes requested") || pageText.includes("Action required")) {
        verdict = "EDIT_AVAILABLE";
        shadow.getElementById("panel-status").textContent = "EDIT AVAIL";
        shadow.getElementById("panel-status").style.background = "#10b981";
        alert(`[${currentProfileId}] 🎉 TIKTOK YÊU CẦU BỔ SUNG! Có nút Edit Application - Sẵn sàng Resubmit!`);
      } else if (pageText.includes("Appeal") || pageText.includes("appeal") || pageText.includes("Suspended")) {
        verdict = "APPEAL_TRIGGERED";
        shadow.getElementById("panel-status").textContent = "DEAD - APPEAL";
        shadow.getElementById("panel-status").style.background = "#e11d48";
        alert(`[${currentProfileId}] 🛑 CẢNH BÁO TỬ ẢI: Phát hiện APPEAL REQUIRED! Hệ thống đang thanh lý Profile...`);
      } else if (pageText.includes("Your shop is approved") || pageText.includes("Active")) {
        verdict = "APPROVED";
        shadow.getElementById("panel-status").textContent = "APPROVED";
        shadow.getElementById("panel-status").style.background = "#8b5cf6";
      }

      if (verdict) {
        chrome.runtime.sendMessage({
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

  // Init
  initProfilesDropdown().then(() => loadProfileDetail(currentProfileId));
})();
