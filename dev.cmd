@echo off
REM Start Vite in a new command window, then run the Rust backend in this window.
REM Usage: Run dev.cmd from the repo root (Windows cmd.exe).
echo Starting Vite dev server in a new window...
start "" cmd /k "cd frontend && npm run dev"

REM Set environment variable for the backend process in this shell.
set VITE_DEV_SERVER=http://localhost:5173
echo Running cargo run (backend) with VITE_DEV_SERVER=%VITE_DEV_SERVER%
cargo run
