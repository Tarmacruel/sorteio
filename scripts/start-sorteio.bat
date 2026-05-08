@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sorteio-runtime.ps1" start
exit /b %ERRORLEVEL%
