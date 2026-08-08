@echo off
REM Boss直聘 原生扫码登录启动器（独立窗口，避免 120s 超时导致二维码看不到）
REM 用法：双击运行，或 start "" scripts\boss_login.cmd
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
"C:\Users\DDOSvoid\.claude\tools\boss-cli\venv\Scripts\boss.exe" login --qrcode
echo.
echo ============================================
echo  登录流程已结束。若上面显示登录成功即可关窗。
echo  若显示失败，可重新双击本文件重试。
echo ============================================
pause
