@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
if errorlevel 1 ( echo setup.ps1 basarisiz & exit /b 1 )
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_python.ps1"
if errorlevel 1 ( echo setup_python.ps1 basarisiz & exit /b 1 )
echo.
echo === Kurulum tamamlandi. Baslatmak icin: start.bat ===
