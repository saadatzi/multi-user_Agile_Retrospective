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
use std::time::{SystemTime, UNIX_EPOCH};
use crate::models::{Card, ClientMessage, Participant, Room, ServerMessage};
use crate::state::{RoomState, SharedState};

pub async fn create_room(State(state): State<SharedState>) -> impl IntoResponse {
    let room_id = Uuid::new_v4();
    let (tx, _) = broadcast::channel(100);
    
    let room = Room {
        id: room_id,
        cards: Vec::new(),
        participants: Vec::new(),
        timer_end_at: None,
        creator_id: None,
        show_names: true,
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

    let participant_id = Uuid::new_v4();

    tracing::info!("New WebSocket connection for room {}: participant {}", room_id, participant_id);

    let join_text = match receiver.next().await {
        Some(Ok(Message::Text(text))) => text,
        Some(Ok(_)) => {
            tracing::warn!("Expected join message from {} in room {}", participant_id, room_id);
            return;
        }
        Some(Err(e)) => {
            tracing::error!("WebSocket receive error before join for {}: {}", participant_id, e);
            return;
        }
        None => return,
    };

    let participant_name = match serde_json::from_str::<ClientMessage>(&join_text) {
        Ok(ClientMessage::JoinRoom { name }) => name,
        Ok(_) => {
            tracing::warn!("First message from {} in room {} was not JOIN_ROOM", participant_id, room_id);
            return;
        }
        Err(e) => {
            tracing::warn!("Failed to parse initial client message from {}: {}", participant_id, e);
            return;
        }
    };

    let participant = Participant::new(participant_id, participant_name);
    tracing::info!("User {} joining room {} as {}", participant_id, room_id, participant.name);

    let (room_to_send, tx) = {
        let mut room_entry = match state.rooms.get_mut(&room_id) {
            Some(entry) => entry,
            None => {
                tracing::error!("Room {} not found during JOIN_ROOM for {}", room_id, participant_id);
                return;
            }
        };

        if room_entry.room.creator_id.is_none() {
            room_entry.room.creator_id = Some(participant_id);
        }

        room_entry.room.participants.push(participant.clone());
        (room_entry.room.clone(), room_entry.tx.clone())
    };

    let mut rx = tx.subscribe();
    let room_state = ServerMessage::RoomState {
        room: room_to_send,
        your_id: participant_id,
    };

    match serde_json::to_string(&room_state) {
        Ok(msg_text) => {
            if sender.send(Message::Text(msg_text.into())).await.is_err() {
                cleanup_participant(&state, room_id, participant_id, false);
                tracing::warn!("Failed to send initial room state to {}", participant_id);
                return;
            }
        }
        Err(e) => {
            tracing::error!("Failed to serialize initial room state for {}: {}", participant_id, e);
            cleanup_participant(&state, room_id, participant_id, false);
            return;
        }
    }

    let _ = tx.send(ServerMessage::UserJoined {
        participant: participant.clone(),
    });

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
            if sender.send(Message::Text(msg_text.into())).await.is_err() {
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
                    ClientMessage::JoinRoom { .. } => {
                        tracing::warn!("User {} sent duplicate JOIN_ROOM in room {}", participant_id, room_id);
                    }
                    ClientMessage::AddCard { text, category } => {
                        tracing::info!("User {} adding card to room {}: '{}' in {:?}", participant_id, room_id, text, category);

                        if let Some(mut room_entry) = state_clone.rooms.get_mut(&room_id) {
                            let author = room_entry
                                .room
                                .participants
                                .iter()
                                .find(|participant| participant.id == participant_id)
                                .map(|participant| participant.name.clone())
                                .unwrap_or_else(|| String::from("Anonymous"));

                            let card = Card {
                                id: Uuid::new_v4(),
                                text,
                                category,
                                votes: 0,
                                author_id: participant_id,
                                author,
                            };

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
                    ClientMessage::StartTimer { duration_seconds } => {
                        if let Some(mut room_entry) = state_clone.rooms.get_mut(&room_id) {
                            if room_entry.room.creator_id == Some(participant_id) {
                                tracing::info!("Creator {} starting timer in room {} for {}s", participant_id, room_id, duration_seconds);
                                let now = SystemTime::now()
                                    .duration_since(UNIX_EPOCH)
                                    .unwrap_or_default()
                                    .as_secs();
                                
                                let end_at = now + duration_seconds;
                                room_entry.room.timer_end_at = Some(end_at);
                                let _ = room_entry.tx.send(ServerMessage::TimerStarted { end_at });
                            } else {
                                tracing::warn!("Non-creator {} tried to start timer", participant_id);
                            }
                        }
                    }
                    ClientMessage::SetShowNames { show_names } => {
                        tracing::info!("User {} set show_names={} in room {}", participant_id, show_names, room_id);
                        if let Some(mut room_entry) = state_clone.rooms.get_mut(&room_id) {
                            room_entry.room.show_names = show_names;
                            let _ = room_entry.tx.send(ServerMessage::ShowNamesUpdated { show_names });
                        }
                    }
                    ClientMessage::SetAnonymous { anonymous } => {
                        tracing::info!("User {} set anonymous={} in room {}", participant_id, anonymous, room_id);
                        if let Some(mut room_entry) = state_clone.rooms.get_mut(&room_id) {
                            let updated_participant = if let Some(participant) = room_entry
                                .room
                                .participants
                                .iter_mut()
                                .find(|participant| participant.id == participant_id)
                            {
                                participant.set_anonymous(anonymous);
                                Some(participant.clone())
                            } else {
                                None
                            };

                            if let Some(updated_participant) = updated_participant {
                                for card in room_entry
                                    .room
                                    .cards
                                    .iter_mut()
                                    .filter(|card| card.author_id == participant_id)
                                {
                                    card.author = updated_participant.name.clone();
                                }

                                let _ = room_entry.tx.send(ServerMessage::ParticipantUpdated {
                                    participant: updated_participant,
                                });
                            }
                        }
                    }
                    ClientMessage::CancelTimer => {
                        if let Some(mut room_entry) = state_clone.rooms.get_mut(&room_id) {
                            if room_entry.room.creator_id == Some(participant_id) {
                                tracing::info!("Creator {} cancelling timer in room {}", participant_id, room_id);
                                room_entry.room.timer_end_at = None;
                                let _ = room_entry.tx.send(ServerMessage::TimerStopped);
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
    cleanup_participant(&state, room_id, participant_id, true);
}

fn cleanup_participant(state: &SharedState, room_id: Uuid, participant_id: Uuid, broadcast_leave: bool) {
    if let Some(mut room_entry) = state.rooms.get_mut(&room_id) {
        let was_creator = room_entry.room.creator_id == Some(participant_id);

        room_entry.room.participants.retain(|participant| participant.id != participant_id);

        if was_creator {
            room_entry.room.creator_id = room_entry.room.participants.first().map(|participant| participant.id);
        }

        if broadcast_leave {
            let _ = room_entry.tx.send(ServerMessage::UserLeft { participant_id });
        }

        if was_creator {
            let _ = room_entry.tx.send(ServerMessage::CreatorChanged {
                creator_id: room_entry.room.creator_id,
            });
        }
    }
}
