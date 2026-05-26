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
    pub author_id: Uuid,
    pub author: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Participant {
    pub id: Uuid,
    pub name: String,
    pub anonymous: bool,
    #[serde(skip_serializing, skip_deserializing, default)]
    pub real_name: String,
}

impl Participant {
    pub fn new(id: Uuid, real_name: String) -> Self {
        let real_name = normalize_participant_name(real_name);

        Self {
            id,
            name: real_name.clone(),
            anonymous: false,
            real_name,
        }
    }

    pub fn set_anonymous(&mut self, anonymous: bool) {
        self.anonymous = anonymous;
        self.name = if anonymous {
            String::from("Anonymous")
        } else {
            self.real_name.clone()
        };
    }
}

fn normalize_participant_name(name: String) -> String {
    let trimmed_name = name.trim();

    if trimmed_name.is_empty() {
        String::from("Anonymous")
    } else {
        trimmed_name.to_string()
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Room {
    pub id: Uuid,
    pub cards: Vec<Card>,
    pub participants: Vec<Participant>,
    pub timer_end_at: Option<u64>, // Unix timestamp in seconds
    pub creator_id: Option<Uuid>,
    pub show_names: bool,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ClientMessage {
    JoinRoom { name: String },
    AddCard { text: String, category: CardCategory },
    VoteCard { card_id: Uuid },
    StartTimer { duration_seconds: u64 },
    SetShowNames { show_names: bool },
    SetAnonymous { anonymous: bool },
    CancelTimer,
    LeaveRoom,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", content = "payload", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ServerMessage {
    RoomState { room: Room, your_id: Uuid },
    UserJoined { participant: Participant },
    UserLeft { participant_id: Uuid },
    ParticipantUpdated { participant: Participant },
    CreatorChanged { creator_id: Option<Uuid> },
    CardAdded { card: Card },
    CardVoted { card_id: Uuid, votes: u32 },
    TimerStarted { end_at: u64 },
    TimerStopped,
    ShowNamesUpdated { show_names: bool },
    Error { message: String },
}
