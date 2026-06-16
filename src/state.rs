use crate::models::{Room, ServerMessage};
use dashmap::DashMap;
use std::sync::Arc;

use uuid::Uuid;

#[derive(Clone)]
pub struct RoomState {
    pub room: Room,
    pub tx: Arc<tokio::sync::broadcast::Sender<ServerMessage>>,
}

#[derive(Clone)]
pub struct AppState {
    pub rooms: DashMap<Uuid, RoomState>,
}

pub type SharedState = Arc<AppState>;

impl AppState {
    pub fn new() -> Self {
        Self {
            rooms: DashMap::new(),
        }
    }
}
