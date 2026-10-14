@echo off
chcp 65001 > nul
title Fox-Auto Copilot Hub ^| Web Tunnel Host (Port 8787 ^<-^> Cloudflare Edge)
echo ================================================================================
echo   Đang khởi động Fox-Auto Copilot Hub và kích hoạt Cloudflare Web Tunnel...
echo ================================================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_tts_tunnel.ps1"

pause
