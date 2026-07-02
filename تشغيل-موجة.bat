@echo off
REM ===== تشغيل موجة محلياً على ويندوز =====
REM يشغّل خادماً محلياً ويفتح المتصفح على التطبيق.
cd /d "%~dp0"
echo.
echo   ==== موجة | Mawja ====
echo   يبدأ الخادم المحلي...
echo   افتح على جوالك (نفس الشبكة):  http://%COMPUTERNAME%:8000
echo   او على هذا الجهاز:            http://localhost:8000
echo.
start "" http://localhost:8000
python -m http.server 8000
pause
