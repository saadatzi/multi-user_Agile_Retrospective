/* eslint-disable react-hooks/refs */
import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Plus,
  Users,
  Vote,
  LogOut,
  Loader2,
  Sparkles,
  AlertCircle,
  Eye,
  EyeOff,
  Clock,
  X,
  Edit,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Room, CardCategory, ServerMessage, ClientMessage } from "./types";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const API_URL = "/api";
const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api`;

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(() => {
    try {
      const pathParts = window.location.pathname.split("/").filter(Boolean);
      if (pathParts.length >= 2 && pathParts[0] === "rooms" && pathParts[1]) {
        return pathParts[1];
      }

      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get("room");
      return roomParam || null;
    } catch {
      return null;
    }
  });
  const [name, setName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCardText, setNewCardText] = useState({
    went_well: "",
    to_improve: "",
    action_items: "",
  });
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timeIsUp = timeLeft === 0;

  const ws = useRef<WebSocket | null>(null);

  // Editing state for card text editing
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  // Participant list popover state
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const participantsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleDocumentClick(e: Event) {
      const target = e.target as Node | null;
      if (!participantsRef.current) return;
      if (!target) return;
      if (!participantsRef.current.contains(target)) {
        setParticipantsOpen(false);
      }
    }

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setParticipantsOpen(false);
    }

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener(
      "touchstart",
      handleDocumentClick as EventListener,
    );
    document.addEventListener("keydown", handleKey as EventListener);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener(
        "touchstart",
        handleDocumentClick as EventListener,
      );
      document.removeEventListener("keydown", handleKey as EventListener);
    };
  }, []);

  const isCreator = room?.creator_id === userId;
  const showNames = room?.show_names ?? true;
  const currentParticipant =
    room?.participants.find((participant) => participant.id === userId) ?? null;
  const currentDisplayName = currentParticipant?.name ?? name;
  const isAnonymous = currentParticipant?.anonymous ?? false;

  const connect = useCallback((id: string, userName: string) => {
    const socket = new WebSocket(`${WS_URL}/rooms/${id}/join`);
    ws.current = socket;

    socket.onopen = () => {
      try {
        const storageKey = `retro:room:${id}:id`;
        const storedClientId = localStorage.getItem(storageKey) || undefined;
        const payload: { name: string; client_id?: string } = {
          name: userName,
        };
        if (storedClientId) payload.client_id = storedClientId;
        const msg: ClientMessage = {
          type: "JOIN_ROOM",
          payload,
        } as ClientMessage;
        socket.send(JSON.stringify(msg));
      } catch {
        const msg: ClientMessage = {
          type: "JOIN_ROOM",
          payload: { name: userName },
        } as ClientMessage;
        socket.send(JSON.stringify(msg));
      }
    };

    socket.onmessage = (event) => {
      const msg: ServerMessage = JSON.parse(event.data);
      switch (msg.type) {
        case "ROOM_STATE": {
          setRoom(msg.payload.room);
          setUserId(msg.payload.your_id);
          try {
            // Persist our client id for this room so future reconnects reuse it
            localStorage.setItem(
              `retro:room:${msg.payload.room.id}:id`,
              msg.payload.your_id,
            );
          } catch {
            // ignore
          }

          if (msg.payload.room.timer_end_at) {
            const remaining = Math.max(
              0,
              msg.payload.room.timer_end_at - Math.floor(Date.now() / 1000),
            );
            setTimeLeft(remaining);
          } else {
            setTimeLeft(null);
          }
          setError(null);
          setJoined(true);
          setLoading(false);
          break;
        }
        case "USER_JOINED":
          setRoom((prev) =>
            prev
              ? {
                  ...prev,
                  participants: prev.participants.some(
                    (participant) =>
                      participant.id === msg.payload.participant.id,
                  )
                    ? prev.participants
                    : [...prev.participants, msg.payload.participant],
                }
              : null,
          );
          break;
        case "USER_LEFT":
          setRoom((prev) =>
            prev
              ? {
                  ...prev,
                  participants: prev.participants.filter(
                    (p) => p.id !== msg.payload.participant_id,
                  ),
                }
              : null,
          );
          break;
        case "PARTICIPANT_UPDATED":
          setRoom((prev) =>
            prev
              ? {
                  ...prev,
                  participants: prev.participants.map((participant) =>
                    participant.id === msg.payload.participant.id
                      ? msg.payload.participant
                      : participant,
                  ),
                  cards: prev.cards.map((card) =>
                    card.author_id === msg.payload.participant.id
                      ? { ...card, author: msg.payload.participant.name }
                      : card,
                  ),
                }
              : null,
          );
          break;
        case "CREATOR_CHANGED":
          setRoom((prev) =>
            prev ? { ...prev, creator_id: msg.payload.creator_id } : null,
          );
          break;
        case "CARD_ADDED":
          setRoom((prev) =>
            prev ? { ...prev, cards: [...prev.cards, msg.payload.card] } : null,
          );
          break;
        case "CARD_VOTED":
          setRoom((prev) =>
            prev
              ? {
                  ...prev,
                  cards: prev.cards.map((c) =>
                    c.id === msg.payload.card_id
                      ? { ...c, votes: msg.payload.votes }
                      : c,
                  ),
                }
              : null,
          );
          break;
        case "CARD_EDITED":
          setRoom((prev) =>
            prev
              ? {
                  ...prev,
                  cards: prev.cards.map((c) =>
                    c.id === msg.payload.card_id
                      ? { ...c, text: msg.payload.text }
                      : c,
                  ),
                }
              : null,
          );
          break;
        case "TIMER_STARTED": {
          setRoom((prev) =>
            prev ? { ...prev, timer_end_at: msg.payload.end_at } : null,
          );
          const remaining = Math.max(
            0,
            msg.payload.end_at - Math.floor(Date.now() / 1000),
          );
          setTimeLeft(remaining);
          break;
        }
        case "TIMER_STOPPED":
          setRoom((prev) => (prev ? { ...prev, timer_end_at: null } : null));
          setTimeLeft(null);
          break;
        case "SHOW_NAMES_UPDATED":
          setRoom((prev) =>
            prev ? { ...prev, show_names: msg.payload.show_names } : null,
          );
          break;
        case "ERROR":
          setError(msg.payload.message);
          setLoading(false);
          break;
      }
    };

    socket.onclose = () => {
      setJoined(false);
      setRoom(null);
      setUserId(null);
      setTimeLeft(null);
      setError("Connection lost. Please try joining again.");
    };
  }, []);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 0) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const createRoom = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server returned ${res.status}: ${text}`);
      }
      const data = await res.json();
      if (data.room_id) {
        setRoomId(data.room_id);
        // Update the browser URL so anyone with this link can open the app and join the room.
        try {
          const newPath = `/rooms/${data.room_id}`;
          window.history.pushState(null, "", newPath);
        } catch {
          // ignore
        }
      } else {
        throw new Error("No room_id in response");
      }
    } catch (err) {
      console.error("Failed to create room:", err);
      setError(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (roomId && trimmedName) {
      setLoading(true);
      connect(roomId, trimmedName);
    }
  };

  const addCard = (category: CardCategory) => {
    const text = newCardText[category];
    if (!text || !ws.current) return;

    const msg: ClientMessage = {
      type: "ADD_CARD",
      payload: { text, category },
    };
    ws.current.send(JSON.stringify(msg));
    setNewCardText((prev) => ({ ...prev, [category]: "" }));
  };

  const voteCard = (card_id: string) => {
    if (!ws.current) return;
    const msg: ClientMessage = { type: "VOTE_CARD", payload: { card_id } };
    ws.current.send(JSON.stringify(msg));
  };

  const cancelTimer = useCallback(() => {
    if (!ws.current || !isCreator) return;
    const msg: ClientMessage = { type: "CANCEL_TIMER" } as ClientMessage;
    ws.current.send(JSON.stringify(msg));
  }, [isCreator]);

  const startTimer = useCallback(
    (minutes: number) => {
      if (!ws.current || !isCreator) return;
      const msg: ClientMessage = {
        type: "START_TIMER",
        payload: { duration_seconds: minutes * 60 },
      } as ClientMessage;
      ws.current.send(JSON.stringify(msg));
    },
    [isCreator],
  );

  const adjustTimer = useCallback(
    (seconds: number) => {
      if (!ws.current || !isCreator) return;
      const currentSeconds = timeLeft || 0;
      const newTotal = Math.max(0, currentSeconds + seconds);
      if (newTotal === 0) {
        cancelTimer();
        return;
      }
      const msg: ClientMessage = {
        type: "START_TIMER",
        payload: { duration_seconds: newTotal },
      } as ClientMessage;
      ws.current.send(JSON.stringify(msg));
    },
    [isCreator, timeLeft, cancelTimer],
  );

  // Timer quick buttons rendered as a stable variable.
  const timerButtons = [1, 5, 10].map((m) => (
    <button
      key={m}
      onClick={() => startTimer(m)}
      className="text-[10px] font-bold hover:text-indigo-600 px-1"
    >
      {m}m
    </button>
  ));

  const toggleShowNames = () => {
    if (!ws.current || !room || !isCreator) return;
    const msg: ClientMessage = {
      type: "SET_SHOW_NAMES",
      payload: { show_names: !showNames },
    };
    ws.current.send(JSON.stringify(msg));
  };

  const toggleAnonymous = () => {
    if (!ws.current || !currentParticipant) return;
    const msg: ClientMessage = {
      type: "SET_ANONYMOUS",
      payload: { anonymous: !currentParticipant.anonymous },
    };
    ws.current.send(JSON.stringify(msg));
  };

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  if (!joined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-2 bg-indigo-600 rounded-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              RetroFlow
            </h1>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex gap-3 text-red-700 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          {!roomId ? (
            <div className="space-y-4">
              <p className="text-slate-600">
                Collaborate with your team in real-time to improve your
                workflows.
              </p>
              <button
                onClick={createRoom}
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Plus className="w-5 h-5" />
                )}
                Create New Retro Room
              </button>
              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-slate-400 font-medium">
                    Or join existing
                  </span>
                </div>
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
                <span className="text-xs font-semibold text-slate-400 uppercase block mb-1">
                  Room ID
                </span>
                <span className="font-mono text-sm text-slate-700 break-all">
                  {roomId}
                </span>
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
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Join Retro"
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRoomId(null);
                  try {
                    window.history.pushState(null, "", "/");
                  } catch {
                    /* ignore: history may be unavailable in some environments */
                  }
                }}
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
      {/* Time is Up Message */}
      {timeIsUp && (
        <div className="bg-yellow-400 border-b-2 border-yellow-500 px-6 py-3 flex items-center justify-center gap-3 animate-pulse shadow-md relative z-50">
          <AlertCircle className="w-5 h-5 text-yellow-900" />
          <span className="text-base font-black text-yellow-900 uppercase tracking-wider">
            ⚠️ Time is up!⚠️
          </span>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-indigo-600 rounded-lg">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-bold text-xl text-slate-900 tracking-tight">
            RetroFlow
          </h1>
          <div className="h-4 w-px bg-slate-200 mx-2 hidden sm:block"></div>

          <div className="flex items-center gap-4">
            <div ref={participantsRef} className="relative">
              <button
                onClick={() => setParticipantsOpen((p) => !p)}
                aria-expanded={participantsOpen}
                className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-full border border-slate-100 hidden sm:flex"
                title="Show active participants"
              >
                <Users className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-600">
                  {room?.participants.length} Active
                </span>
              </button>

              {participantsOpen && (
                <div className="absolute mt-2 right-0 w-56 bg-white rounded-lg border shadow-lg z-30 p-2">
                  <div className="text-xs text-slate-500 font-semibold mb-2">
                    Participants
                  </div>
                  <ul className="max-h-56 overflow-auto divide-y divide-slate-100">
                    {(room?.participants || []).map((p) => (
                      <li
                        key={p.id}
                        className={cn(
                          "flex items-center justify-between px-2 py-2 text-sm",
                          p.id === userId ? "bg-indigo-50" : "",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-500">
                            {p.name[0]?.toUpperCase()}
                          </div>
                          <span className="text-slate-700">{p.name}</span>
                        </div>
                        {p.id === room?.creator_id ? (
                          <span className="text-[10px] text-slate-400 uppercase">
                            Host
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Timer Display */}
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-1 rounded-full border transition-all",
                timeLeft !== null && timeLeft < 60
                  ? "bg-red-50 border-red-100 text-red-600"
                  : "bg-slate-50 border-slate-100 text-slate-600",
              )}
            >
              <Clock className="w-4 h-4" />
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-bold">
                  {timeLeft !== null ? formatTime(timeLeft) : "00:00"}
                </span>

                {isCreator && (
                  <div className="flex items-center gap-1 ml-1 border-l border-slate-200 pl-2">
                    {timeLeft === null ? (
                      timerButtons
                    ) : (
                      <>
                        <button
                          onClick={() => adjustTimer(-30)}
                          className="text-[10px] font-bold hover:text-amber-600 px-1"
                        >
                          -30s
                        </button>
                        <button
                          onClick={() => adjustTimer(30)}
                          className="text-[10px] font-bold hover:text-emerald-600 px-1"
                        >
                          +30s
                        </button>
                        <button
                          onClick={cancelTimer}
                          className="text-[10px] font-bold hover:text-red-600 px-1 flex items-center gap-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={isCreator ? toggleShowNames : undefined}
            disabled={!isCreator}
            aria-disabled={!isCreator}
            className={cn(
              "p-2 transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-wider",
              isCreator
                ? "text-slate-400 hover:text-indigo-600"
                : "text-slate-300 cursor-not-allowed opacity-60",
            )}
            title={
              isCreator
                ? showNames
                  ? "Hide Names And Messages"
                  : "Show Names And Messages"
                : "Only the room host can toggle message visibility"
            }
          >
            {showNames ? (
              <Eye className="w-5 h-5" />
            ) : (
              <EyeOff className="w-5 h-5 text-indigo-600" />
            )}
            <span className="hidden md:block">
              {showNames ? "Hide" : "Show"}
            </span>
          </button>

          <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block"></div>

          <button
            onClick={toggleAnonymous}
            className={cn(
              "px-3 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider transition-colors inline-flex",
              isAnonymous
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:text-slate-900",
            )}
            title={isAnonymous ? "Show my name" : "Hide my name"}
          >
            {isAnonymous ? "Show My Name" : "Go Anonymous"}
          </button>

          <div className="text-right hidden sm:block">
            <div className="text-sm font-bold text-slate-900 leading-none">
              {currentDisplayName || "Anonymous"}
            </div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              User
            </div>
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
        {renderColumn(
          "Went Well",
          "went_well",
          "bg-emerald-50 text-emerald-700 border-emerald-100",
        )}
        {renderColumn(
          "To Improve",
          "to_improve",
          "bg-amber-50 text-amber-700 border-amber-100",
        )}
        {renderColumn(
          "Action Items",
          "action_items",
          "bg-blue-50 text-blue-700 border-blue-100",
        )}
      </main>
    </div>
  );

  function renderColumn(title: string, category: CardCategory, colors: string) {
    const cards = room?.cards.filter((c) => c.category === category) || [];

    return (
      <div className="flex flex-col h-full bg-white/50 rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div
          className={cn(
            "px-4 py-3 border-b flex items-center justify-between",
            colors,
          )}
        >
          <h2 className="font-bold uppercase tracking-wider text-sm">
            {title}
          </h2>
          <span className="text-xs font-bold bg-white/50 px-2 py-0.5 rounded-full">
            {cards.length}
          </span>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-4">
          <div className="relative group">
            <textarea
              placeholder={`What ${title.toLowerCase()}?`}
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none text-sm min-h-[80px] pr-10"
              value={newCardText[category]}
              onChange={(e) =>
                setNewCardText((prev) => ({
                  ...prev,
                  [category]: e.target.value,
                }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
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
            {cards
              .sort((a, b) => b.votes - a.votes)
              .map((card) => {
                const authorParticipant = room?.participants.find(
                  (participant) => participant.id === card.author_id,
                );
                const authorName = authorParticipant?.name ?? card.author;
                const authorIsAnonymous =
                  authorParticipant?.anonymous ?? authorName === "Anonymous";
                const isOwnMessage = card.author_id === userId;
                const showAuthorToViewer =
                  isOwnMessage || (!authorIsAnonymous && showNames);

                return (
                  <div
                    key={card.id}
                    className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-200 transition-all group"
                  >
                    {editingCardId === card.id ? (
                      <textarea
                        className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none text-sm min-h-[80px]"
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        autoFocus
                      />
                    ) : (
                      <p
                        className={cn(
                          "text-sm mb-3 whitespace-pre-wrap",
                          showNames || isOwnMessage
                            ? "text-slate-800"
                            : "text-slate-400 italic",
                        )}
                      >
                        {showNames || isOwnMessage
                          ? card.text
                          : "Message hidden"}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {showAuthorToViewer && (
                          <>
                            <div className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-500">
                              {authorName[0]?.toUpperCase()}
                            </div>
                            <span className="text-[11px] font-medium text-slate-400 capitalize">
                              {authorName}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {editingCardId === card.id ? null : (
                          <button
                            onClick={() => voteCard(card.id)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors border border-slate-100"
                          >
                            <Vote className="w-3.5 h-3.5" />
                            <span className="text-xs font-bold">
                              {card.votes}
                            </span>
                          </button>
                        )}

                        {/* Edit button only for the author */}
                        {card.author_id === userId &&
                          editingCardId !== card.id && (
                            <button
                              onClick={() => {
                                setEditingCardId(card.id);
                                setEditingText(card.text);
                              }}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors border border-slate-100"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          )}

                        {editingCardId === card.id && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                if (!ws.current) return;
                                const msg: ClientMessage = {
                                  type: "EDIT_CARD",
                                  payload: {
                                    card_id: card.id,
                                    text: editingText,
                                  },
                                } as ClientMessage;
                                ws.current.send(JSON.stringify(msg));
                                setEditingCardId(null);
                                setEditingText("");
                              }}
                              className="px-2 py-1 bg-indigo-600 text-white rounded-md text-xs font-semibold"
                              disabled={!editingText.trim()}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingCardId(null);
                                setEditingText("");
                              }}
                              className="px-2 py-1 bg-slate-100 text-slate-700 rounded-md text-xs font-semibold border"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    );
  }
}
