use std::sync::Arc;
use dashmap::DashMap;
use tokio::sync::broadcast;
use uuid::Uuid;
use crate::models::{Room, ServerMessage};

pub struct RoomState {
    pub room: Room,
    pub tx: broadcast::Sender<ServerMessage>,
}

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
