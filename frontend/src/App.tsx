import React, { useState, useRef, useCallback } from 'react';
import { Plus, Users, Vote, LogOut, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Room, CardCategory, ServerMessage, ClientMessage } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const API_URL = 'http://localhost:3000/api';
const WS_URL = 'ws://localhost:3000/api';

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCardText, setNewCardText] = useState({ went_well: '', to_improve: '', action_items: '' });
  
  const ws = useRef<WebSocket | null>(null);

  const connect = useCallback((id: string, userName: string) => {
    const socket = new WebSocket(`${WS_URL}/rooms/${id}/join`);
    ws.current = socket;

    socket.onopen = () => {
      const msg: ClientMessage = { type: 'JOIN_ROOM', payload: { name: userName } };
      socket.send(JSON.stringify(msg));
    };

    socket.onmessage = (event) => {
      const msg: ServerMessage = JSON.parse(event.data);
      switch (msg.type) {
        case 'ROOM_STATE':
          setRoom(msg.payload);
          setJoined(true);
          setLoading(false);
          break;
        case 'USER_JOINED':
          setRoom(prev => prev ? { ...prev, participants: [...prev.participants, msg.payload.participant] } : null);
          break;
        case 'USER_LEFT':
          setRoom(prev => prev ? { ...prev, participants: prev.participants.filter(p => p.id !== msg.payload.participant_id) } : null);
          break;
        case 'CARD_ADDED':
          setRoom(prev => prev ? { ...prev, cards: [...prev.cards, msg.payload.card] } : null);
          break;
        case 'CARD_VOTED':
          setRoom(prev => prev ? { 
            ...prev, 
            cards: prev.cards.map(c => c.id === msg.payload.card_id ? { ...c, votes: msg.payload.votes } : c) 
          } : null);
          break;
      }
    };

    socket.onclose = () => {
      setJoined(false);
      setRoom(null);
      setError('Connection lost. Please try joining again.');
    };
  }, []);

  const createRoom = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('API URL:', API_URL);
      console.log('Creating room...');
      const res = await fetch(`${API_URL}/rooms`, { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      console.log('Response status:', res.status);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server returned ${res.status}: ${text}`);
      }
      const data = await res.json();
      console.log('Room created:', data);
      if (data.room_id) {
        setRoomId(data.room_id);
      } else {
        throw new Error('No room_id in response');
      }
    } catch (err) {
      console.error('Failed to create room:', err);
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId && name) {
      setLoading(true);
      connect(roomId, name);
    }
  };

  const addCard = (category: CardCategory) => {
    const text = newCardText[category];
    if (!text || !ws.current) return;

    const msg: ClientMessage = { type: 'ADD_CARD', payload: { text, category } };
    ws.current.send(JSON.stringify(msg));
    setNewCardText(prev => ({ ...prev, [category]: '' }));
  };

  const voteCard = (card_id: string) => {
    if (!ws.current) return;
    const msg: ClientMessage = { type: 'VOTE_CARD', payload: { card_id } };
    ws.current.send(JSON.stringify(msg));
  };

  if (!joined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-2 bg-indigo-600 rounded-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">RetroFlow</h1>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex gap-3 text-red-700 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          {!roomId ? (
            <div className="space-y-4">
              <p className="text-slate-600">Collaborate with your team in real-time to improve your workflows.</p>
              <button 
                onClick={createRoom}
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                Create New Retro Room
              </button>
              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-400 font-medium">Or join existing</span></div>
              </div>
              <input 
                type="text" 
                placeholder="Enter Room ID" 
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none text-slate-900"
                onChange={(e) => setRoomId(e.target.value)}
              />
            </div>
          ) : (
            <form onSubmit={handleJoin} className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 mb-2">
                <span className="text-xs font-semibold text-slate-400 uppercase block mb-1">Room ID</span>
                <span className="font-mono text-sm text-slate-700 break-all">{roomId}</span>
              </div>
              <input 
                autoFocus
                type="text" 
                placeholder="What's your name?" 
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none text-slate-900"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 px-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Join Retro"}
              </button>
              <button 
                type="button" 
                onClick={() => setRoomId(null)}
                className="w-full text-slate-500 text-sm font-medium hover:text-slate-700"
              >
                Go back
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-indigo-600 rounded-lg">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-bold text-xl text-slate-900 tracking-tight">RetroFlow</h1>
          <div className="h-4 w-px bg-slate-200 mx-2 hidden sm:block"></div>
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-full border border-slate-100 hidden sm:flex">
            <Users className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-600">{room?.participants.length} Active</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-bold text-slate-900 leading-none">{name}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">User</div>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
            title="Leave room"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Retro Board */}
      <main className="flex-1 p-6 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-[1600px] mx-auto w-full">
        {renderColumn('Went Well', 'went_well', 'bg-emerald-50 text-emerald-700 border-emerald-100')}
        {renderColumn('To Improve', 'to_improve', 'bg-amber-50 text-amber-700 border-amber-100')}
        {renderColumn('Action Items', 'action_items', 'bg-blue-50 text-blue-700 border-blue-100')}
      </main>
    </div>
  );

  function renderColumn(title: string, category: CardCategory, colors: string) {
    const cards = room?.cards.filter(c => c.category === category) || [];
    
    return (
      <div className="flex flex-col h-full bg-white/50 rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className={cn("px-4 py-3 border-b flex items-center justify-between", colors)}>
          <h2 className="font-bold uppercase tracking-wider text-sm">{title}</h2>
          <span className="text-xs font-bold bg-white/50 px-2 py-0.5 rounded-full">{cards.length}</span>
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto space-y-4">
          <div className="relative group">
            <textarea 
              placeholder={`What ${title.toLowerCase()}?`}
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none text-sm min-h-[80px] pr-10"
              value={newCardText[category]}
              onChange={(e) => setNewCardText(prev => ({ ...prev, [category]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  addCard(category);
                }
              }}
            />
            <button 
              onClick={() => addCard(category)}
              disabled={!newCardText[category]}
              className="absolute right-2 bottom-3 p-1.5 bg-indigo-600 text-white rounded-lg opacity-0 group-focus-within:opacity-100 transition-opacity disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            {cards.sort((a, b) => b.votes - a.votes).map(card => (
              <div key={card.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-200 transition-all group">
                <p className="text-slate-800 text-sm mb-3 whitespace-pre-wrap">{card.text}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-500">
                      {card.author[0]?.toUpperCase()}
                    </div>
                    <span className="text-[11px] font-medium text-slate-400 capitalize">{card.author}</span>
                  </div>
                  <button 
                    onClick={() => voteCard(card.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors border border-slate-100"
                  >
                    <Vote className="w-3.5 h-3.5" />
                    <span className="text-xs font-bold">{card.votes}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
}

