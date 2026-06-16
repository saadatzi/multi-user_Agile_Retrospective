use axum::{
    http::StatusCode,
    response::IntoResponse,
    routing::{any, get, get_service, post},
    Router,
};
use std::{env, net::SocketAddr, path::PathBuf, sync::Arc};
use tower_http::services::{ServeDir, ServeFile};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod handlers;
mod models;
mod state;

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "retro_api=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let state = Arc::new(state::AppState::new());
    let app = build_app(state);

    let host = std::env::var("HOST").unwrap_or_else(|_| String::from("0.0.0.0"));
    let port = std::env::var("PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(3000);
    let addr: SocketAddr = format!("{host}:{port}")
        .parse()
        .unwrap_or_else(|error| panic!("invalid bind address {host}:{port}: {error}"));

    tracing::info!(address = %addr, "listening");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

fn build_app(state: state::SharedState) -> Router {
    let app = Router::new()
        .route("/api/rooms", post(handlers::create_room))
        .route("/api/rooms/{room_id}/join", get(handlers::join_room))
        .route("/api", any(api_not_found))
        .route("/api/{*path}", any(api_not_found));

    let app = if let Some(frontend_dist) = frontend_dist_dir() {
        let frontend_index = frontend_dist.join("index.html");
        tracing::info!(path = %frontend_dist.display(), "serving frontend assets from disk");

        app.fallback_service(get_service(
            ServeDir::new(frontend_dist).not_found_service(ServeFile::new(frontend_index)),
        ))
    } else {
        tracing::warn!(
            "frontend build not found; run `npm run dev` inside `frontend/` during development, or set FRONTEND_DIST_DIR in production"
        );

        app.fallback(dev_frontend_unavailable)
    };

    app.with_state(state)
}

fn frontend_dist_dir() -> Option<PathBuf> {
    frontend_dist_candidates()
        .into_iter()
        .find(|path| path.join("index.html").is_file())
}

fn frontend_dist_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(path) = env::var("FRONTEND_DIST_DIR") {
        candidates.push(PathBuf::from(path));
    }

    if let Ok(current_dir) = env::current_dir() {
        candidates.push(current_dir.join("frontend").join("dist"));
    }

    if let Ok(current_exe) = env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join("frontend").join("dist"));
            candidates.push(exe_dir.join("..").join("frontend").join("dist"));
        }
    }

    candidates
}

async fn api_not_found() -> impl IntoResponse {
    (StatusCode::NOT_FOUND, "API route not found")
}

async fn dev_frontend_unavailable() -> impl IntoResponse {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "Frontend assets are not available. In development, run `npm run dev` inside `frontend/` and open http://127.0.0.1:5173/. In production, make sure `frontend/dist` is present or set FRONTEND_DIST_DIR.",
    )
}
