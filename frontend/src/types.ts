export type CardCategory = 'went_well' | 'to_improve' | 'action_items';

export interface Card {
  id: string;
  text: string;
  category: CardCategory;
  votes: number;
  author: string;
}

export interface Participant {
  id: string;
  name: string;
}

export interface Room {
  id: string;
  cards: Card[];
  participants: Participant[];
}

export type ClientMessage =
  | { type: 'JOIN_ROOM'; payload: { name: string } }
  | { type: 'ADD_CARD'; payload: { text: string; category: CardCategory } }
  | { type: 'VOTE_CARD'; payload: { card_id: string } }
  | { type: 'LEAVE_ROOM' };

export type ServerMessage =
  | { type: 'ROOM_STATE'; payload: Room }
  | { type: 'USER_JOINED'; payload: { participant: Participant } }
  | { type: 'USER_LEFT'; payload: { participant_id: string } }
  | { type: 'CARD_ADDED'; payload: { card: Card } }
  | { type: 'CARD_VOTED'; payload: { card_id: string; votes: number } }
  | { type: 'ERROR'; payload: { message: string } };
