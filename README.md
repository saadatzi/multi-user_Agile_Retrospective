# RetroFlow

RetroFlow is a full-stack retrospective app with a Rust backend and a React + Vite frontend.

## Stack

- Backend: Rust + Axum
- Frontend: React + Vite
- Frontend source: `frontend/`
- Production frontend output: `frontend/dist`

## Requirements

- Rust toolchain with Cargo
- Node.js with `npm`

## Development

Development mode keeps the frontend and backend separate.

### 1. Run the backend

From the repository root:

```sh
cargo run
```

The backend listens on `http://127.0.0.1:3000` by default.

### 2. Run the frontend

From `frontend/`:

```sh
npm install
npm run dev
```

The Vite dev server runs on `http://127.0.0.1:5173` and proxies:

- HTTP requests from `/api` to the Rust backend
- WebSocket requests from `/api/...` to the Rust backend

That means the frontend always uses relative `/api` URLs, so hot reload works cleanly in development without bundling the frontend into Rust.

## Production build

When you run:

```sh
cargo build --release
```

Cargo automatically runs the frontend production build through `build.rs`:

1. Enters `frontend/`
2. Installs dependencies if needed
   - Uses `npm ci` when `package-lock.json` is present
   - Falls back to `npm install` otherwise
3. Runs `npm run build`
4. Writes the built assets to `frontend/dist`

The build script only runs the frontend release build for the `release` profile, and Cargo watches frontend files so unchanged frontend sources do not trigger unnecessary rebuilds.

## Serving the frontend in production

At runtime, the Rust backend serves static files from `frontend/dist`.

- Real files such as compiled JS, CSS, and public assets are served directly
- Unknown non-API routes fall back to `frontend/dist/index.html`
- This supports SPA routes such as `/rooms/<room_id>`

## Environment variables

- `PORT`: backend port (default `3000`)
- `VITE_BACKEND_URL`: optional override for the Vite dev proxy target
- `FRONTEND_DIST_DIR`: optional override for where the backend should look for built frontend assets
- `SKIP_FRONTEND_BUILD`: optional escape hatch to skip the frontend build in Cargo

## Notes

- If `frontend/dist/index.html` is missing, the backend still serves the API, but frontend requests will return a helpful development message.
- In production, the backend looks for frontend assets in `FRONTEND_DIST_DIR`, then `./frontend/dist`, then paths relative to the executable.
- In normal development, open the app through the Vite dev server, not through the Rust backend port.
