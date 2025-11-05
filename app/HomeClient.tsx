"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [invite, setInvite] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [showNameModal, setShowNameModal] = useState(false);
  const [displayName, setDisplayName] = useState('Player');

  // Validate code format (uses the same charset roughly as generator)
  function isValidCode(code: string) {
    return /^[A-HJ-NP-Z2-9]{4,8}$/.test(code);
  }

  // Start join flow: validate, verify lobby exists, then show name modal
  async function startJoinFlow() {
    setInviteError(null);
    const raw = invite.trim().toUpperCase();
    if (!raw) return setInviteError('Please enter a lobby code');
    if (!isValidCode(raw)) return setInviteError('Invalid code format');

    try {
      const res = await fetch(`/api/lobbies/${encodeURIComponent(raw)}`);
      if (!res.ok) {
        const text = await res.text();
        console.error('Lobby fetch failed', res.status, text);
        setInviteError('Lobby not found');
        return;
      }

      // Lobby exists — show inline name modal
      setShowNameModal(true);
      setDisplayName((prev) => prev || 'Player');
    } catch (err) {
      console.error(err);
      setInviteError('Network error — try again');
    }
  }

  // Confirm join with a display name
  async function confirmJoin() {
    const code = invite.trim().toUpperCase();
    const name = (displayName || 'Player').trim() || 'Player';
    setJoinLoading(true);
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
        setInviteError(text || 'Failed to join lobby');
        setJoinLoading(false);
        return;
      }

      if (!contentType.includes('application/json')) {
        const text = await joinRes.text();
        console.error('Expected JSON but got:', contentType, text);
        setInviteError('Unexpected server response');
        setJoinLoading(false);
        return;
      }

      const data = await joinRes.json();
      setJoinLoading(false);
      setShowNameModal(false);
      router.push(`/lobby/${encodeURIComponent(code)}?playerId=${encodeURIComponent(data.id)}`);
    } catch (err) {
      setJoinLoading(false);
      console.error(err);
      setInviteError(String(err));
    }
  }

  async function createLobby() {
    setLoading(true);
    try {
      const res = await fetch("/api/lobbies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostName: "Host" }),
      });

      const contentType = res.headers.get("content-type") || "";

      if (!res.ok) {
        // Try to get a helpful body (JSON or text) for debugging
        const text = await res.text();
        console.error("Create lobby failed", res.status, text);
        alert("Server error: " + (text || res.status));
        setLoading(false);
        return;
      }

      if (!contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Expected JSON but got:", contentType, text);
        alert("Unexpected server response — check console for details.");
        setLoading(false);
        return;
      }

      const data = await res.json();
      setLoading(false);
      router.push(`/pre-game-lobby/${data.code}?playerId=${encodeURIComponent(data.id)}`);
    } catch (err) {
      setLoading(false);
      console.error(err);
      alert(String(err));
    }
  }

  return (
    <div
      className="h-screen w-full bg-cover bg-center relative"
      style={{ backgroundImage: `url('/main-bg.jpg')` }}
    >
      <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
        <h1 className="text-white mb-8">Ride the Bus!</h1>
        <div className="flex flex-col items-center space-x-4">
          <div className="flex flex-row gap-8 mb-4">
            <Button
              onClick={createLobby}
              className="bg-blue-500 hover:bg-blue-600"
            >
              {loading ? "Creating..." : "Create Lobby"}
            </Button>
            <Button onClick={startJoinFlow} className="bg-green-500 hover:bg-green-600">
              {joinLoading ? 'Joining...' : 'Join'}
            </Button>
          </div>
        </div>
        {inviteError && (
          <div className="mt-2 text-sm text-red-400">{inviteError}</div>
        )}
        <div suppressHydrationWarning>
          <input
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                startJoinFlow();
              }
            }}
            placeholder="Enter invite code"
            className="px-3 py-2 rounded bg-white/10 placeholder:text-gray-300 text-white outline-none"
            suppressHydrationWarning
          />
        </div>

        {/* Name modal */}
        {showNameModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowNameModal(false)} />
            <div className="relative bg-white/5 p-6 rounded-lg backdrop-blur-sm w-full max-w-md z-10">
              <h2 className="text-white text-xl mb-3">Enter display name</h2>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 rounded bg-white/10 text-white outline-none mb-4"
              />
              <div className="flex justify-end gap-3">
                <button
                  className="px-4 py-2 bg-white/10 text-white rounded"
                  onClick={() => setShowNameModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 bg-blue-500 text-white rounded"
                  onClick={confirmJoin}
                  disabled={joinLoading}
                >
                  {joinLoading ? 'Joining...' : 'Join lobby'}
                </button>
              </div>
              {inviteError && <div className="mt-3 text-sm text-red-400">{inviteError}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
