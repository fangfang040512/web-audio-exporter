@echo off
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 goto local
start "" "http://127.0.0.1:8898/index.html"
python -m http.server 8898 --bind 127.0.0.1
goto :eof
:local
start "" "index.html"
