#!/usr/bin/env bash
# Start Vite in background, then run the Rust backend in foreground.
# Usage: ./dev.sh

npm --prefix frontend run dev &
export VITE_DEV_SERVER=http://localhost:5173

cargo run
