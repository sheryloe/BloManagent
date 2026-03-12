@echo off
setlocal
cd /d "%~dp0"
if not exist data mkdir data
if not exist node_modules (
  call npm install
)
call npm run build
call npm run start
