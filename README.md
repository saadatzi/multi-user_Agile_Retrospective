# RetroFlow

RetroFlow is a small real-time retrospective web app: a Rust (axum) backend serving a React + Vite frontend. The frontend is built into `frontend/dist` and embedded into the Rust binary via `rust-embed` and the `build.rs` script.

This repository contains both the API (backend) and the UI (frontend). It supports creating rooms, joining over WebSocket, adding/voting cards, timers, and toggling anonymous/names visibility.

---

## Repository layout

- `src/` — Rust backend (axum) source
  - `src/main.rs` — HTTP routes, static-asset serving and server bootstrap
  - `src/handlers.rs` — HTTP + WebSocket handlers
  - `src/models.rs` — message & domain models
  - `src/state.rs` — in-memory application state
- `frontend/` — React + Vite front-end app
  - `frontend/src` — TypeScript React source
  - `frontend/dist` — production build output (generated)
  - `frontend/package.json` — front-end scripts & dependencies
- `build.rs` — Cargo build script that builds the frontend (runs `npm ci` + `npm run build`) unless `SKIP_FRONTEND_BUILD` is set

---

## Requirements

- Rust toolchain with Cargo (stable)
- Node.js (recommended v18+) and `npm`
- Git (optional)

On Windows: make sure `npm` is available on your PATH.

---

## Quickstart (production / embedded frontend)

This is the simplest way to run the app locally; it builds the frontend into `frontend/dist` and the Rust server will embed and serve those assets.

1. Build the frontend

```sh
cd frontend
npm ci
npm run build
cd ..
```

2. Run the backend

```sh
cargo run
```

3. Open the app in your browser

- Default: http://127.0.0.1:3000/

When you create a room, the app updates your browser URL to `/rooms/<room_id>` so you can copy and share the link. Anyone who opens that URL will see the join form for that room and can join by entering their name.

Notes:
- The server uses the `PORT` environment variable if present. Example:
  - Windows (cmd.exe): `set PORT=8080 && cargo run`
  - PowerShell: `$env:PORT = 8080; cargo run`
  - Linux/macOS: `PORT=8080 cargo run`

---

## Development workflow (fast feedback)

If you want hot-reload for the frontend while running the backend:

1. Start Vite dev server for the frontend (hot reload)

```sh
cd frontend
npm ci
npm run dev
```

Vite will serve the frontend (usually at `http://localhost:5173`). The frontend `import.meta.env.DEV` is `true` in that environment so it talks to the backend at `http://localhost:3000/api` (the client code is already configured to use `localhost:3000` in development).

2. Start the backend

```sh
# Option A (default): allow build.rs to run the frontend build step automatically
cargo run

# Option B: avoid build.rs running the frontend build every time
# (only recommended if you already ran `npm run build` once)
# Windows (cmd.exe):
set SKIP_FRONTEND_BUILD=1 && cargo run
# PowerShell:
$env:SKIP_FRONTEND_BUILD = '1'; cargo run
# Linux/macOS:
SKIP_FRONTEND_BUILD=1 cargo run
```

Important: `build.rs` will panic if `SKIP_FRONTEND_BUILD` is set but `frontend/dist` does not exist. Use `SKIP_FRONTEND_BUILD` only after a successful `npm run build`.

If you prefer not to trigger any frontend builds at all, run the pre-built binary directly (skip Cargo build step):

```sh
# Windows example (after building):
./target/debug/retro-api.exe
```

---

## API & WebSocket

- POST `/api/rooms`
  - Creates a room. Response: `201 Created` with JSON `{ "room_id": "<uuid>" }`.

- GET `/api/rooms/:room_id/join`
  - Upgrades to a WebSocket. The client must send a `JOIN_ROOM` message first (see below). All further communication is JSON messages over the WebSocket.

Message formats (client -> server):

- JOIN_ROOM
```json
{ "type": "JOIN_ROOM", "payload": { "name": "Your Name" } }
```
- ADD_CARD
```json
{ "type": "ADD_CARD", "payload": { "text": "Card text", "category": "went_well" } }
```
  - `category` values: `went_well`, `to_improve`, `action_items`
- VOTE_CARD
```json
{ "type": "VOTE_CARD", "payload": { "card_id": "<uuid>" } }
```
- START_TIMER
```json
{ "type": "START_TIMER", "payload": { "duration_seconds": 120 } }
```
- CANCEL_TIMER
```json
{ "type": "CANCEL_TIMER" }
```
- SET_SHOW_NAMES
```json
{ "type": "SET_SHOW_NAMES", "payload": { "show_names": true } }
```
- SET_ANONYMOUS
```json
{ "type": "SET_ANONYMOUS", "payload": { "anonymous": true } }
```
- LEAVE_ROOM
```json
{ "type": "LEAVE_ROOM" }
```

Server messages follow the `ServerMessage` enum in `src/models.rs`. Important messages include `ROOM_STATE`, `USER_JOINED`, `CARD_ADDED`, `CARD_VOTED`, `TIMER_STARTED`, `TIMER_STOPPED`, `SHOW_NAMES_UPDATED`, and `ERROR`.

WebSocket example to join using `websocat` / browser console:

```
# Using `websocat` (example):
websocat ws://127.0.0.1:3000/api/rooms/<room_id>/join
# Then send a JOIN_ROOM JSON as first message
```

---

## Configuration / environment

- `PORT` — port the server listens on (default 3000)
- `SKIP_FRONTEND_BUILD` — if set, `build.rs` will skip running `npm`/`vite build` but only when `frontend/dist` already exists. If `SKIP_FRONTEND_BUILD` is set and `frontend/dist` is missing, the build will fail with a panic (intended to avoid accidental skips).

Binding address: the server currently binds to `127.0.0.1` (localhost) by default. To make it reachable externally, edit `src/main.rs` and change the bind address from `127.0.0.1` to `0.0.0.0`, then recompile.

---

## Build (release)

```sh
cargo build --release
# The release binary will be in target/release/retro-api(.exe on Windows)
```

---

## Troubleshooting

- If `cargo run` fails trying to run `npm` make sure Node.js and `npm` are installed and on your PATH.
- If `SKIP_FRONTEND_BUILD` causes a panic, remove it or run `npm run build` first in `frontend` so `frontend/dist` exists.
- If ports conflict, change `PORT`.

---

## Notes

- The backend is intentionally simple and keeps state in-memory using a concurrent `DashMap`. It is not persisted and restarts will clear rooms and cards.
- Frontend messages and shapes are defined in `src/models.rs` and mirrored in `frontend/src/types.ts`.

---

If you want, I can:
- Start the server for you locally (I can run the commands here), or
- Add a short CONTRIBUTING.md with development tips, or
- Add example curl/ws client scripts for testing the WebSocket API.
