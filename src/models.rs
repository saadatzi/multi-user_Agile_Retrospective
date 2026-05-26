use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CardCategory {
    WentWell,
    ToImprove,
    ActionItems,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Card {
    pub id: Uuid,
    pub text: String,
    pub category: CardCategory,
    pub votes: u32,
    pub author: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Participant {
    pub id: Uuid,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Room {
    pub id: Uuid,
    pub cards: Vec<Card>,
    pub participants: Vec<Participant>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ClientMessage {
    JoinRoom { name: String },
    AddCard { text: String, category: CardCategory },
    VoteCard { card_id: Uuid },
    LeaveRoom,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", content = "payload", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ServerMessage {
    RoomState(Room),
    UserJoined { participant: Participant },
    UserLeft { participant_id: Uuid },
    CardAdded { card: Card },
    CardVoted { card_id: Uuid, votes: u32 },
    Error { message: String },
}
