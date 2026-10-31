@echo off
title Stop AI Exam Answer Grader
cd /d "%~dp0"
set "PYTHON="
if defined GRADER_PYTHON set "PYTHON=%GRADER_PYTHON%"
if not defined PYTHON if exist "%USERPROFILE%\anaconda3\envs\ml\python.exe" set "PYTHON=%USERPROFILE%\anaconda3\envs\ml\python.exe"
if not defined PYTHON if exist "%USERPROFILE%\miniconda3\envs\ml\python.exe" set "PYTHON=%USERPROFILE%\miniconda3\envs\ml\python.exe"
if not defined PYTHON if exist "%LOCALAPPDATA%\anaconda3\envs\ml\python.exe" set "PYTHON=%LOCALAPPDATA%\anaconda3\envs\ml\python.exe"
if not defined PYTHON set "PYTHON=python"
"%PYTHON%" launcher.py stop
echo.
echo   This window closes in 5 seconds.
timeout /t 5 >nul
