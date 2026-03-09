# Windows Packaging + Auto Update

This app can ship as:
- `NSIS installer` (recommended for auto-update)
- `portable` (manual update only)

## 1) Build prerequisites

- Node 20+
- Python 3.11+
- `pyinstaller`

Install Python build dependency:

```powershell
python -m pip install --upgrade pip
pip install pyinstaller requests
```

## 2) Build Python worker

From repository root:

```powershell
pyinstaller --clean --noconfirm irs_bot_server.spec
mkdir irs_bot\dist -Force
copy dist\irs_bot_server.exe irs_bot\dist\irs_bot_server.exe
```

Electron packaging expects worker at:
- `irs_bot/dist/irs_bot_server.exe`

## 3) Build Windows app

From `app` folder:

```powershell
npm ci
npm run build:win
```

Output:
- `app/dist/*.exe` (setup + portable)

## 4) Auto-update model

Auto-update is enabled in main process with `electron-updater`.

Behavior:
- Dev mode: disabled.
- Packaged mode:
  - check updates
  - download update
  - install/restart only when worker is stopped

Renderer IPC:
- `app:update:get-state`
- `app:update:check`
- `app:update:download`
- `app:update:install`

Main events pushed to renderer:
- `app:update-state`

## 5) GitHub Releases publish

`electron-builder.yml` uses GitHub publish provider:
- `GH_OWNER`
- `GH_REPO`

CI workflow:
- `.github/workflows/app-win-release.yml`
- Builds Python worker exe
- Builds Electron Windows release
- Publishes artifacts + update metadata to GitHub Releases

Tag pattern for release pipeline:
- `app-v*`

Example:

```bash
git tag app-v1.0.1
git push origin app-v1.0.1
```

## 6) Recommended release policy

- Use NSIS build for production users (auto-update support).
- Keep portable as fallback/manual distribution.
- Keep user data in `%AppData%\\bug-auto` (already configured) to avoid data loss across upgrades.
