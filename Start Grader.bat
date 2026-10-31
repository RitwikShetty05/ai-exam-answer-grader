@echo off
title AI Exam Answer Grader
cd /d "%~dp0"
set "PYTHON="
if defined GRADER_PYTHON set "PYTHON=%GRADER_PYTHON%"
if not defined PYTHON if exist "%USERPROFILE%\anaconda3\envs\ml\python.exe" set "PYTHON=%USERPROFILE%\anaconda3\envs\ml\python.exe"
if not defined PYTHON if exist "%USERPROFILE%\miniconda3\envs\ml\python.exe" set "PYTHON=%USERPROFILE%\miniconda3\envs\ml\python.exe"
if not defined PYTHON if exist "%LOCALAPPDATA%\anaconda3\envs\ml\python.exe" set "PYTHON=%LOCALAPPDATA%\anaconda3\envs\ml\python.exe"
if not defined PYTHON set "PYTHON=python"
"%PYTHON%" launcher.py start
if errorlevel 1 (
  echo.
  echo   Something did not start. Read the messages above, then press a key.
  pause
  exit /b 1
)
echo.
echo   The app is running. This window closes in 10 seconds.
timeout /t 10 >nul
