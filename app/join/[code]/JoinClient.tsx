"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  code: string;
};

export default function JoinClient({ code }: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAutoJoined, setHasAutoJoined] = useState(false);

  async function handleJoin() {
    const name = (displayName || 'Player').trim() || 'Player';
    setJoinLoading(true);
    setError(null);
    
    try {
      const joinRes = await fetch(`/api/lobbies/${encodeURIComponent(code)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      const contentType = joinRes.headers.get('content-type') || '';
      if (!joinRes.ok) {
        const text = await joinRes.text();
        console.error('Join failed', joinRes.status, text);
        setError(text || 'Failed to join lobby');
        setJoinLoading(false);
        return;
      }

      if (!contentType.includes('application/json')) {
        const text = await joinRes.text();
        console.error('Expected JSON but got:', contentType, text);
        setError('Unexpected server response');
        setJoinLoading(false);
        return;
      }

      const data = await joinRes.json();
      setJoinLoading(false);
      router.push(`/pre-game-lobby/${encodeURIComponent(code)}?playerId=${encodeURIComponent(data.id)}`);
    } catch (err) {
      setJoinLoading(false);
      console.error(err);
      setError('Network error — try again');
    }
  }

  // Auto-join on mount
  useEffect(() => {
    if (!hasAutoJoined) {
      setHasAutoJoined(true);
      handleJoin();
    }
  }, [hasAutoJoined]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-b from-green-900 to-green-700 p-4">
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 max-w-md w-full shadow-2xl">
        <h1 className="text-4xl font-bold text-white text-center mb-2">
          Ride The Bus
        </h1>
        <p className="text-white/80 text-center mb-6">
          {joinLoading ? 'Joining lobby...' : error ? 'Failed to join' : 'Joined!'}
        </p>
        <p className="text-white/60 text-center mb-6">
          Lobby: <span className="font-mono font-bold text-xl">{code}</span>
        </p>

        {error && (
          <div className="space-y-4">
            <div className="text-red-300 bg-red-900/30 p-3 rounded-lg text-sm">
              {error}
            </div>

            <div>
              <label htmlFor="displayName" className="block text-white mb-2">
                Enter your name
              </label>
              <Input
                id="displayName"
                type="text"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !joinLoading) {
                    handleJoin();
                  }
                }}
                disabled={joinLoading}
                className="bg-white/20 border-white/30 text-white placeholder:text-white/50"
              />
            </div>

            <Button
              onClick={handleJoin}
              disabled={joinLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 text-lg"
            >
              {joinLoading ? 'Joining...' : 'Try Again'}
            </Button>

            <Button
              onClick={() => router.push('/')}
              variant="outline"
              className="w-full border-white/30 text-white hover:bg-white/10"
            >
              Back to Home
            </Button>
          </div>
        )}

        {joinLoading && (
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          </div>
        )}
      </div>
    </div>
  );
}
