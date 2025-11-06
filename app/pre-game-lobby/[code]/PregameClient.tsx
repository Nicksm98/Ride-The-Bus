"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useSearchParams, useRouter } from "next/navigation";

type Player = { id: string; name: string };

const MAX_NAME_LENGTH = 20;

export default function PregameClient({ code }: { code: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPlayerId = searchParams?.get?.('playerId') || null;

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingBot, setAddingBot] = useState(false);

  useEffect(() => {
    if (!code) return;

    const codeUpper = code.toUpperCase();

    let mounted = true;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("lobbies")
          .select("players, status")
          .eq("code", codeUpper)
          .maybeSingle();
        if (error) {
          console.error("Failed to fetch lobby", error);
        } else if (mounted && data) {
          setPlayers(data.players || []);
          // If game already started, redirect immediately
          if (data.status === 'in-progress') {
            router.push(`/lobby/${encodeURIComponent(code)}?playerId=${encodeURIComponent(currentPlayerId || '')}`);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const channel = supabase
      .channel(`lobby-${codeUpper}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lobbies", filter: `code=eq.${codeUpper}` },
        (payload) => {
          console.log('Realtime update received:', payload);
          try {
            setPlayers(payload.new.players || []);
            // Auto-redirect all players when game starts
            if (payload.new.status === 'in-progress') {
              router.push(`/lobby/${encodeURIComponent(code)}?playerId=${encodeURIComponent(currentPlayerId || '')}`);
            }
          } catch (e) {
            console.error("Failed to update players from realtime payload", e);
          }
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });

    // Polling fallback in case realtime doesn't work
    const pollInterval = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from("lobbies")
          .select("players, status")
          .eq("code", codeUpper)
          .maybeSingle();
        
        if (!error && data && mounted) {
          console.log('Poll update - players:', data.players?.length, 'status:', data.status);
          setPlayers(data.players || []);
          if (data.status === 'in-progress') {
            console.log('Game started! Redirecting to game lobby...');
            router.push(`/lobby/${encodeURIComponent(code)}?playerId=${encodeURIComponent(currentPlayerId || '')}`);
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 1000); // Poll every 1 second for faster response

    return () => {
      mounted = false;
      clearInterval(pollInterval);
      try {
        // removeChannel is the API to unsubscribe for the current supabase client
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [code, router, currentPlayerId]);

  // Add a bot player for testing
  const addBot = async () => {
    try {
      setAddingBot(true);
      const res = await fetch(`/api/lobbies/${encodeURIComponent(code)}/add-bot`, {
        method: 'POST'
      });

      if (!res.ok) {
        const body = await res.json();
        alert(body.error || 'Failed to add bot');
        return;
      }

      // Update players immediately (realtime may be delayed)
      const data = await res.json();
      setPlayers(data.players || []);
    } catch (err) {
      console.error('Failed to add bot:', err);
      alert('Failed to add bot');
    } finally {
      setAddingBot(false);
    }
  };

  return (
    <div
      className="h-screen w-full bg-cover bg-center relative"
      style={{ backgroundImage: `url('/green-felt.jpg')` }}
    >
      <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
        <h1 className="text-white mb-8 text-4xl">Lobby {code}</h1>
        <div className="bg-white/10 p-8 rounded-lg backdrop-blur-sm w-full max-w-lg">
          <div className="text-white mb-4">
            <h2 className="text-xl mb-2">Players</h2>
            {loading ? (
              <div className="text-sm text-gray-300">Loading players…</div>
            ) : players.length === 0 ? (
              <div className="text-sm text-gray-300">Waiting for players to join...</div>
            ) : (
              <ul className="space-y-2">
                {players.map((p) => {
                  const isBot = p.id.startsWith('bot-');
                  return (
                  <li key={p.id} className="text-white flex items-center gap-3">
                    <span className={`flex-none w-8 h-8 rounded-full flex items-center justify-center ${isBot ? 'bg-purple-600' : 'bg-gray-700'}`}>
                      {isBot ? '🤖' : p.name.charAt(0).toUpperCase()}
                    </span>
                    {editingId === p.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="px-2 py-1 rounded bg-white/10 text-white outline-none"
                          maxLength={MAX_NAME_LENGTH}
                        />
                        {error && (
                          <div className="text-red-500 text-sm absolute mt-8">
                            {error}
                          </div>
                        )}
                        <button
                          className="px-2 py-1 bg-blue-500 rounded"
                          onClick={async () => {
                            const trimmedName = editingName.trim();
                            if (!trimmedName) {
                              setError("Name cannot be empty");
                              return;
                            }
                            if (trimmedName.length > MAX_NAME_LENGTH) {
                              setError(`Name must be ${MAX_NAME_LENGTH} characters or less`);
                              return;
                            }
                            try {
                              setSaving(true);
                              setError(null);
                              const res = await fetch(`/api/lobbies/${encodeURIComponent(code)}/rename`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ playerId: p.id, name: trimmedName }),
                              });
                              if (res.ok) {
                                const body = await res.json();
                                setPlayers(body.players || players);
                                setEditingId(null);
                                setEditingName("");
                              } else {
                                const body = await res.json();
                                setError(body.error || 'Failed to rename player');
                              }
                            } catch (err) {
                              console.error(err);
                              setError(String(err));
                            } finally {
                              setSaving(false);
                            }
                          }}
                          disabled={saving}
                        >
                          Save
                        </button>
                        <button className="px-2 py-1 bg-gray-600 rounded" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1">{p.name}</span>
                        {p.id === currentPlayerId && (
                          <button
                            className="ml-3 px-2 py-1 bg-yellow-500 rounded text-black text-sm"
                            onClick={() => {
                              setEditingId(p.id);
                              setEditingName(p.name);
                            }}
                          >
                            Edit
                          </button>
                        )}
                        {isBot && (
                          <button
                            className="ml-2 px-2 py-1 bg-red-500 rounded text-white text-sm hover:bg-red-600"
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/lobbies/${encodeURIComponent(code)}/remove-bot`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ botId: p.id }),
                                });

                                if (!res.ok) {
                                  const body = await res.json();
                                  alert(body.error || 'Failed to remove bot');
                                  return;
                                }

                                const data = await res.json();
                                setPlayers(data.players || []);
                              } catch (err) {
                                console.error('Failed to remove bot:', err);
                                alert('Failed to remove bot');
                              }
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </>
                    )}
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-4">
            <button
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              onClick={() => navigator.clipboard.writeText(`${window.location.origin}/join/${code}`)}
            >
              Copy Invite Link
            </button>
            <button
              className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
              onClick={addBot}
              disabled={addingBot || players.length >= 8}
            >
              {addingBot ? 'Adding Bot...' : '🤖 Add Bot'}
            </button>
            <button
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
              onClick={async () => {
                if (players.length < 2) {
                  alert("Need at least 2 players to start");
                  return;
                }
                
                console.log('Starting game for lobby:', code.toUpperCase());
                
                // Update lobby status to start the game for everyone
                try {
                  const { data, error } = await supabase
                    .from('lobbies')
                    .update({ status: 'in-progress' })
                    .eq('code', code.toUpperCase());
                  
                  console.log('Update result:', { data, error });
                  
                  if (error) {
                    console.error('Failed to start game:', error);
                    alert(`Failed to start game: ${error.message}`);
                    return;
                  }
                  
                  console.log('Game started successfully, redirecting host...');
                  // Navigate host immediately (others will be redirected via realtime/polling)
                  router.push(`/lobby/${encodeURIComponent(code)}?playerId=${encodeURIComponent(currentPlayerId || '')}`);
                } catch (err) {
                  console.error('Failed to start game:', err);
                  alert('Failed to start game');
                }
              }}
              disabled={players.length < 2}
            >
              Start Game {players.length < 2 && `(${players.length}/2)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
