use axum::{
    body::Body,
    http::{header, HeaderValue, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::{get, post},
    Router,
};
use rust_embed::RustEmbed;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod handlers;
mod models;
mod state;

#[derive(RustEmbed)]
#[folder = "frontend/dist"]
struct FrontendAssets;

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "retro_api=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let state = Arc::new(state::AppState::new());

    // Build our application with routes
    let app = Router::new()
        .route("/api/rooms", post(handlers::create_room))
        .route("/api/rooms/:room_id/join", get(handlers::join_room))
        .with_state(state)
        .fallback(serve_frontend)
        .layer(
            CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods(tower_http::cors::Any)
                .allow_headers(tower_http::cors::Any),
        )
        .layer(TraceLayer::new_for_http());

    // Run it
    let port = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    tracing::info!("listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn serve_frontend(uri: Uri) -> Response {
    // If a Vite dev server is running (set via VITE_DEV_SERVER), proxy requests to it so
    // the SPA benefits from HMR and dev middleware while the Rust backend stays running.
    if let Ok(dev_server) = std::env::var("VITE_DEV_SERVER") {
        let dev_base = dev_server.trim_end_matches('/');
        // Build full URL to proxy (path + optional query)
        let mut path_and_query = uri.path().to_string();
        if let Some(q) = uri.query() {
            path_and_query.push('?');
            path_and_query.push_str(q);
        }
        let url = format!("{}{}", dev_base, path_and_query);

        match reqwest::get(&url).await {
            Ok(resp) => {
                // Map important headers (Content-Type) and body
                let bytes = resp.bytes().await.unwrap_or_default();
                let mut response = Response::new(Body::from(bytes.to_vec()));

                if let Some(ct) = resp.headers().get(reqwest::header::CONTENT_TYPE) {
                    if let Ok(ct_str) = ct.to_str() {
                        if let Ok(hv) = HeaderValue::from_str(ct_str) {
                            response.headers_mut().insert(header::CONTENT_TYPE, hv);
                        }
                    }
                }

                return response;
            }
            Err(e) => tracing::warn!("Failed to proxy to Vite dev server at {}: {}", dev_base, e),
        }
    }

    let requested_path = uri.path().trim_start_matches('/');
    let asset_path = if requested_path.is_empty() {
        "index.html"
    } else {
        requested_path
    };

    serve_asset(asset_path).unwrap_or_else(|| {
        if asset_path.starts_with("api/") {
            StatusCode::NOT_FOUND.into_response()
        } else {
            serve_asset("index.html").unwrap_or_else(|| {
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "Frontend bundle is unavailable. Rebuild the project.",
                )
                    .into_response()
            })
        }
    })
}

fn serve_asset(path: &str) -> Option<Response> {
    let asset = FrontendAssets::get(path)?;
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    let mut response = Response::new(Body::from(asset.data.into_owned()));
    let content_type = HeaderValue::from_str(mime.as_ref())
        .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream"));
    response
        .headers_mut()
        .insert(header::CONTENT_TYPE, content_type);
    Some(response)
}
