@echo off
rem Serves the harness at http://localhost:8000 and opens it in the default
rem browser. Requires Node.js (npx downloads http-server on first run).
cd /d "%~dp0"
npx --yes http-server . -p 8000 -o
