use axum::{
    extract::{Path, State, WebSocketUpgrade},
    extract::ws::{Message, WebSocket},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use tokio::sync::broadcast;
use uuid::Uuid;
use crate::models::{Card, ClientMessage, Participant, Room, ServerMessage};
use crate::state::{RoomState, SharedState};

pub async fn create_room(State(state): State<SharedState>) -> impl IntoResponse {
    let room_id = Uuid::new_v4();
    let (tx, _) = broadcast::channel(100);
    
    let room = Room {
        id: room_id,
        cards: Vec::new(),
        participants: Vec::new(),
    };
    
    state.rooms.insert(room_id, RoomState { room, tx });
    
    (StatusCode::CREATED, Json(json!({ "room_id": room_id })))
}

pub async fn join_room(
    ws: WebSocketUpgrade,
    Path(room_id): Path<Uuid>,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    if !state.rooms.contains_key(&room_id) {
        return (StatusCode::NOT_FOUND, "Room not found").into_response();
    }
    
    ws.on_upgrade(move |socket| handle_socket(socket, room_id, state))
}

async fn handle_socket(socket: WebSocket, room_id: Uuid, state: SharedState) {
    let (mut sender, mut receiver) = socket.split();
    
    // Subscribe to room updates
    let mut rx = {
        let room_entry = match state.rooms.get(&room_id) {
            Some(entry) => entry,
            None => {
                tracing::error!("Room {} not found during WebSocket upgrade", room_id);
                return;
            }
        };
        room_entry.tx.subscribe()
    };
    
    let participant_id = Uuid::new_v4();
    let mut participant_name = String::from("Anonymous");

    tracing::info!("New WebSocket connection for room {}: participant {}", room_id, participant_id);

    // Task to forward broadcast messages to this client
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            let msg_text = match serde_json::to_string(&msg) {
                Ok(t) => t,
                Err(e) => {
                    tracing::error!("Failed to serialize message: {}", e);
                    continue;
                }
            };
            if sender.send(Message::Text(msg_text)).await.is_err() {
                break;
            }
        }
        tracing::debug!("Send task for {} finished", participant_id);
    });

    // Task to handle incoming messages from this client
    let state_clone = state.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(msg_result) = receiver.next().await {
            let text = match msg_result {
                Ok(Message::Text(t)) => t,
                Ok(_) => continue,
                Err(e) => {
                    tracing::error!("WebSocket receive error for {}: {}", participant_id, e);
                    break;
                }
            };

            if let Ok(msg) = serde_json::from_str::<ClientMessage>(&text) {
                match msg {
                    ClientMessage::JoinRoom { name } => {
                        tracing::info!("User {} joining room {} as {}", participant_id, room_id, name);
                        let participant = Participant { id: participant_id, name: name.clone() };
                        participant_name = name;
                        
                        if let Some(mut room_entry) = state_clone.rooms.get_mut(&room_id) {
                            room_entry.room.participants.push(participant.clone());
                            let _ = room_entry.tx.send(ServerMessage::UserJoined { participant });
                            
                            // Send full state to the newly joined user
                            let room_to_send = room_entry.room.clone();
                            let _ = room_entry.tx.send(ServerMessage::RoomState(room_to_send));
                        }
                    }
                    ClientMessage::AddCard { text, category } => {
                        tracing::info!("User {} adding card to room {}: '{}' in {:?}", participant_id, room_id, text, category);
                        let card = Card {
                            id: Uuid::new_v4(),
                            text,
                            category,
                            votes: 0,
                            author: participant_name.clone(),
                        };
                        
                        if let Some(mut room_entry) = state_clone.rooms.get_mut(&room_id) {
                            room_entry.room.cards.push(card.clone());
                            let _ = room_entry.tx.send(ServerMessage::CardAdded { card });
                        }
                    }
                    ClientMessage::VoteCard { card_id } => {
                        tracing::info!("User {} voting for card {} in room {}", participant_id, card_id, room_id);
                        if let Some(mut room_entry) = state_clone.rooms.get_mut(&room_id) {
                            if let Some(card) = room_entry.room.cards.iter_mut().find(|c| c.id == card_id) {
                                card.votes += 1;
                                let votes = card.votes;
                                let _ = room_entry.tx.send(ServerMessage::CardVoted { 
                                    card_id, 
                                    votes
                                });
                            }
                        }
                    }
                    ClientMessage::LeaveRoom => break,
                }
            } else {
                tracing::warn!("Failed to parse client message from {}: {}", participant_id, text);
                if let Some(room_entry) = state_clone.rooms.get(&room_id) {
                    let _ = room_entry.tx.send(ServerMessage::Error { 
                        message: format!("Invalid message format: {}", text) 
                    });
                }
            }
        }
        tracing::debug!("Recv task for {} finished", participant_id);
    });

    // Wait for either task to finish
    tokio::select! {
        _ = (&mut send_task) => {
            tracing::info!("Send task for {} ended, aborting recv task", participant_id);
            recv_task.abort();
        },
        _ = (&mut recv_task) => {
            tracing::info!("Recv task for {} ended, aborting send task", participant_id);
            send_task.abort();
        },
    };

    // Cleanup: remove participant and notify others
    tracing::info!("Cleaning up participant {} from room {}", participant_id, room_id);
    if let Some(mut room_entry) = state.rooms.get_mut(&room_id) {
        room_entry.room.participants.retain(|p| p.id != participant_id);
        let _ = room_entry.tx.send(ServerMessage::UserLeft { participant_id });
    }
}
