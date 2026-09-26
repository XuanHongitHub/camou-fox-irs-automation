# IRS Bot (Queue + ProxyXoay + Camoufox)

This package implements a continuous automation pipeline:

1. Watch `inbox/` for `.xlsx`/`.csv`
2. Validate and enqueue each row as a job in Redis/RQ
3. For each job: rotate ProxyXoay IP, launch Camoufox, run workflow steps
4. Require 2-step confirmation before final submit
5. Persist results and screenshots under `outputs/` + `artifacts/`

## Install

```bash
python -m pip install -r irs_bot/requirements.txt
```

Copy config template:

```bash
cp irs_bot/config.example.yml irs_bot/config.yml
```

Fill your secrets in `irs_bot/config.yml`:
- ProxyXoay login credentials
- Proxy runtime endpoint credentials
- If your proxy fails SSL on healthcheck endpoints, set `proxy_runtime.skip_healthcheck: true` for test mode

## Commands

Import one file into queue:

```bash
python -m irs_bot --config irs_bot/config.yml import-excel input.xlsx
```

Watch folder and enqueue continuously:

```bash
python -m irs_bot --config irs_bot/config.yml watch --inbox inbox --archive archive --error error
```

Start worker:

```bash
python -m irs_bot --config irs_bot/config.yml worker
```

Manual browser session (you operate by hand, system rotates proxy and auto-saves HTML snapshots on navigation/load):

```bash
python -m irs_bot --config irs_bot/config.yml manual --url "https://sa.www4.irs.gov/applyein/legalStructure"
```

Manual browser session without rotate API (still uses configured proxy runtime, saves HTML snapshots):

```bash
python -m irs_bot --config irs_bot/config.yml manual --skip-rotate --url "https://sa.www4.irs.gov/applyein/legalStructure"

`manual` mode also:
- auto-saves browser downloads into `artifacts/manual/.../downloads`
- injects a bottom-right `Save Web` button to snapshot current HTML on demand
- uses `browser.manual_window_width` / `browser.manual_window_height` to keep Camoufox viewport aligned
```

Run scheduler once:

```bash
python -m irs_bot --config irs_bot/config.yml scheduler
```

Proxy helper commands:

```bash
python -m irs_bot --config irs_bot/config.yml proxy sync
python -m irs_bot --config irs_bot/config.yml proxy count
python -m irs_bot --config irs_bot/config.yml proxy rotate --code XPY0001_PM33
python -m irs_bot --config irs_bot/config.yml proxy renew --codes N0001_CS747,N0001_CS745
```

## Notes

- Queue backend is Redis + RQ.
- Captcha/block pages are marked as `manual_required`.
- Submit is guarded by two-step confirm gate.
- `workflow` and `selectors` in config must be tailored to the target flow.
- `manual` mode requires valid ProxyXoay API credentials only when rotate is enabled.
- Runtime proxy modes:
  - `proxy_runtime.rotate_url` set: rotate by URL (global throttle).
  - `rotate_url` empty + `proxy_runtime.proxy_list` non-empty: round-robin runtime list, with per-proxy cooldown based on `change_ip_wait_seconds`.
  - Otherwise: default ProxyXoay API rotate flow.
