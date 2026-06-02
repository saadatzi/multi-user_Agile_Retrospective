export type CardCategory = "went_well" | "to_improve" | "action_items";

export interface Card {
  id: string;
  text: string;
  category: CardCategory;
  votes: number;
  author_id: string;
  author: string;
}

export interface Participant {
  id: string;
  name: string;
  anonymous: boolean;
}

export interface Room {
  id: string;
  cards: Card[];
  participants: Participant[];
  timer_end_at?: number | null;
  creator_id?: string | null;
  show_names: boolean;
}

export type ClientMessage =
  | { type: "JOIN_ROOM"; payload: { name: string; client_id?: string } }
  | { type: "ADD_CARD"; payload: { text: string; category: CardCategory } }
  | { type: "VOTE_CARD"; payload: { card_id: string } }
  | { type: "EDIT_CARD"; payload: { card_id: string; text: string } }
  | { type: "START_TIMER"; payload: { duration_seconds: number } }
  | { type: "SET_SHOW_NAMES"; payload: { show_names: boolean } }
  | { type: "SET_ANONYMOUS"; payload: { anonymous: boolean } }
  | { type: "CANCEL_TIMER" }
  | { type: "LEAVE_ROOM" };

export type ServerMessage =
  | { type: "ROOM_STATE"; payload: { room: Room; your_id: string } }
  | { type: "USER_JOINED"; payload: { participant: Participant } }
  | { type: "USER_LEFT"; payload: { participant_id: string } }
  | { type: "PARTICIPANT_UPDATED"; payload: { participant: Participant } }
  | { type: "CREATOR_CHANGED"; payload: { creator_id: string | null } }
  | { type: "CARD_ADDED"; payload: { card: Card } }
  | { type: "CARD_EDITED"; payload: { card_id: string; text: string } }
  | { type: "CARD_VOTED"; payload: { card_id: string; votes: number } }
  | { type: "TIMER_STARTED"; payload: { end_at: number } }
  | { type: "TIMER_STOPPED" }
  | { type: "SHOW_NAMES_UPDATED"; payload: { show_names: boolean } }
  | { type: "ERROR"; payload: { message: string } };
