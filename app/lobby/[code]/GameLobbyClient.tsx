"use client";

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { PlayingCard, CardBack } from "@/components/ui/playing-card";
import { Button } from "@/components/ui/button";
import type { 
  GameState, 
  PlayerCard,
  Card
} from "@/lib/types/game";
import { isRedCard, getCardValue } from "@/lib/types/game";

type Player = { id: string; name: string };

export default function GameLobbyClient({ code }: { code: string }) {
  const searchParams = useSearchParams();
  const currentPlayerId = searchParams?.get?.('playerId') || null;

  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDrinkPrompt, setShowDrinkPrompt] = useState(false);
  const [deck, setDeck] = useState<Card[]>([]);

  // Load lobby data
  useEffect(() => {
    if (!code) return;

    const codeUpper = code.toUpperCase();
    let mounted = true;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("lobbies")
          .select("players")
          .eq("code", codeUpper)
          .maybeSingle();

        if (error) {
          console.error("Failed to fetch lobby", error);
        } else if (mounted && data) {
          setPlayers(data.players || []);
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
          if (mounted) {
            setPlayers(payload.new.players || []);
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [code]);

  // Create a shuffled deck
  const createShuffledDeck = (): Card[] => {
    const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks: Card['rank'][] = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
    
    const allCards: Card[] = [];
    for (const suit of suits) {
      for (const rank of ranks) {
        allCards.push({ suit, rank, drawn: false });
      }
    }

    // Shuffle
    for (let i = allCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
    }

    return allCards;
  };

  // Draw a card from deck
  const drawCardFromDeck = (): Card => {
    const availableCards = deck.filter(c => !c.drawn);
    if (availableCards.length === 0) {
      throw new Error('No cards left in deck');
    }
    const card = availableCards[0];
    
    // Mark as drawn
    setDeck(current => 
      current.map(c => 
        c.suit === card.suit && c.rank === card.rank ? { ...c, drawn: true } : c
      )
    );
    
    return card;
  };

  // Start the game
  const startGame = async () => {
    if (players.length < 2) {
      alert("Need at least 2 players to start");
      return;
    }

    try {
      // Create deck(s) based on player count
      const numDecks = players.length >= 5 ? 2 : 1;
      
      console.log(`Creating ${numDecks} deck(s)...`);
      let combinedDeck: Card[] = [];
      for (let i = 0; i < numDecks; i++) {
        combinedDeck = [...combinedDeck, ...createShuffledDeck()];
      }
      setDeck(combinedDeck);
      console.log(`Created deck with ${combinedDeck.length} cards`);

      const deckIds: string[] = [`deck-${Date.now()}`];

      // Initialize game state
      const initialGameState: GameState = {
        phase: 'round1_dealing',
        deckIds,
        players: players.map((p, idx) => ({
          id: p.id,
          name: p.name,
          cards: [],
          collectedCards: [],
          currentCardIndex: 0,
          isCurrentPlayer: idx === 0,
          drinkCount: 0
        })),
        currentPlayerIndex: 0,
        round2Index: 0,
        round2CardDrawn: null,
        busDriverId: null,
        busDriverPartnerIndex: 0,
        busDriverCards: [],
        busDriverCorrectGuesses: 0
      };

      setGameState(initialGameState);

      // Deal 4 cards to each player
      console.log('Dealing cards...');
      dealCards(initialGameState, combinedDeck);
      console.log('Game started successfully!');
    } catch (err) {
      console.error("Failed to start game:", err);
      alert(`Failed to start game: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Deal 4 cards to each player
  const dealCards = (state: GameState, deckCards: Card[]) => {
    const updatedPlayers = [...state.players];
    let currentDeck = [...deckCards];

    for (let i = 0; i < updatedPlayers.length; i++) {
      const playerCards: PlayerCard[] = [];
      
      for (let j = 0; j < 4; j++) {
        const availableCards = currentDeck.filter(c => !c.drawn);
        if (availableCards.length === 0) {
          throw new Error('Not enough cards in deck');
        }
        const card = availableCards[0];
        playerCards.push({ card, revealed: false });
        
        // Mark as drawn
        currentDeck = currentDeck.map(c => 
          c.suit === card.suit && c.rank === card.rank ? { ...c, drawn: true } : c
        );
      }
      
      updatedPlayers[i].cards = playerCards;
    }

    // Update deck state
    setDeck(currentDeck);

    setGameState({
      ...state,
      players: updatedPlayers,
      phase: 'round1_guessing'
    });
  };

  // Round 1: Handle player guesses
  const handleRound1Guess = useCallback(async (guess: string) => {
    if (!gameState || gameState.phase !== 'round1_guessing') return;

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const cardIndex = currentPlayer.currentCardIndex;
    const card = currentPlayer.cards[cardIndex].card;

    let isCorrect = false;

    // Check guess based on card index
    switch (cardIndex) {
      case 0: // Red or Black
        isCorrect = (guess === 'red' && isRedCard(card)) || 
                   (guess === 'black' && !isRedCard(card));
        break;
      
      case 1: // Higher or Lower
        const card0Value = getCardValue(currentPlayer.cards[0].card);
        const card1Value = getCardValue(card);
        isCorrect = (guess === 'higher' && card1Value > card0Value) ||
                   (guess === 'lower' && card1Value < card0Value) ||
                   (guess === 'same' && card1Value === card0Value);
        break;
      
      case 2: // Between or Outside
        const firstValue = getCardValue(currentPlayer.cards[0].card);
        const secondValue = getCardValue(currentPlayer.cards[1].card);
        const thirdValue = getCardValue(card);
        const min = Math.min(firstValue, secondValue);
        const max = Math.max(firstValue, secondValue);
        
        isCorrect = (guess === 'between' && thirdValue > min && thirdValue < max) ||
                   (guess === 'outside' && (thirdValue <= min || thirdValue >= max));
        break;
      
      case 3: // Suit
        isCorrect = guess === card.suit;
        break;
    }

    // Show drink prompt if wrong
    if (!isCorrect) {
      setShowDrinkPrompt(true);
      setTimeout(() => setShowDrinkPrompt(false), 2000);
    }

    // Reveal the card
    const updatedPlayers = [...gameState.players];
    updatedPlayers[gameState.currentPlayerIndex].cards[cardIndex].revealed = true;

    // Move to next card or next player
    if (cardIndex < 3) {
      updatedPlayers[gameState.currentPlayerIndex].currentCardIndex++;
      setGameState({ ...gameState, players: updatedPlayers });
    } else {
      // Move to next player
      const nextPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
      
      updatedPlayers[gameState.currentPlayerIndex].isCurrentPlayer = false;
      updatedPlayers[nextPlayerIndex].isCurrentPlayer = true;

      // Check if round 1 is complete
      if (nextPlayerIndex === 0) {
        // All players finished, move to round 2
        setGameState({
          ...gameState,
          players: updatedPlayers,
          phase: 'round2_goodbadugly',
          currentPlayerIndex: 0
        });
      } else {
        setGameState({
          ...gameState,
          players: updatedPlayers,
          currentPlayerIndex: nextPlayerIndex
        });
      }
    }
  }, [gameState]);

  // Auto-play for bots
  useEffect(() => {
    if (!gameState || gameState.phase !== 'round1_guessing') return;

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const isBot = currentPlayer.id.startsWith('bot-');

    if (!isBot) return;

    // Bot makes a random guess after a delay
    const timer = setTimeout(() => {
      const cardIndex = currentPlayer.currentCardIndex;
      let guess = '';

      switch (cardIndex) {
        case 0: // Red or Black
          guess = Math.random() > 0.5 ? 'red' : 'black';
          break;
        case 1: // Higher or Lower
          guess = Math.random() > 0.66 ? 'higher' : Math.random() > 0.5 ? 'lower' : 'same';
          break;
        case 2: // Between or Outside
          guess = Math.random() > 0.5 ? 'between' : 'outside';
          break;
        case 3: // Suit
          const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
          guess = suits[Math.floor(Math.random() * suits.length)];
          break;
      }

      handleRound1Guess(guess);
    }, 1500); // 1.5 second delay to see the bot "thinking"

    return () => clearTimeout(timer);
  }, [gameState, handleRound1Guess]);

  if (loading) {
    return (
      <div className="h-screen w-full bg-cover bg-center relative"
        style={{ backgroundImage: `url('/green-felt.jpg')` }}>
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="text-white text-2xl">Loading game...</div>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="h-screen w-full bg-cover bg-center relative"
        style={{ backgroundImage: `url('/green-felt.jpg')` }}>
        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
          <h1 className="text-white mb-8 text-4xl">Ride the Bus</h1>
          <div className="bg-white/10 p-8 rounded-lg backdrop-blur-sm">
            <h2 className="text-white text-xl mb-4">Players ({players.length})</h2>
            <ul className="space-y-2 mb-6">
              {players.map(p => (
                <li key={p.id} className="text-white">{p.name}</li>
              ))}
            </ul>
            <Button onClick={startGame} className="w-full">
              Start Game
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-cover bg-center relative"
      style={{ backgroundImage: `url('/green-felt.jpg')` }}>
      <div className="absolute inset-0 bg-black/50 p-4">
        <GamePhaseView 
          gameState={gameState}
          currentPlayerId={currentPlayerId}
          onRound1Guess={handleRound1Guess}
        />
        
        {showDrinkPrompt && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="bg-red-600 text-white text-6xl font-bold p-12 rounded-lg animate-bounce">
              DRINK! 🍺
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Component to render the current game phase
function GamePhaseView({ 
  gameState, 
  currentPlayerId,
  onRound1Guess 
}: { 
  gameState: GameState;
  currentPlayerId: string | null;
  onRound1Guess: (guess: string) => void;
}) {
  if (gameState.phase === 'round1_guessing') {
    return <Round1View 
      gameState={gameState} 
      currentPlayerId={currentPlayerId}
      onGuess={onRound1Guess}
    />;
  }

  if (gameState.phase === 'round2_goodbadugly') {
    return <Round2View gameState={gameState} />;
  }

  if (gameState.phase === 'round3_busdriver') {
    return <Round3View gameState={gameState} />;
  }

  return <div className="text-white">Game Phase: {gameState.phase}</div>;
}

// Round 1: Individual card guessing
function Round1View({ 
  gameState, 
  currentPlayerId,
  onGuess 
}: { 
  gameState: GameState;
  currentPlayerId: string | null;
  onGuess: (guess: string) => void;
}) {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const isMyTurn = currentPlayer.id === currentPlayerId;
  const cardIndex = currentPlayer.currentCardIndex;

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <h2 className="text-white text-3xl mb-8">
        {isMyTurn ? "Your Turn!" : `${currentPlayer.name}'s Turn`}
      </h2>

      {/* Show all players and their cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {gameState.players.map(player => (
          <div key={player.id} className={`bg-white/10 p-4 rounded-lg ${player.isCurrentPlayer ? 'ring-2 ring-yellow-400' : ''}`}>
            <div className="text-white font-bold mb-2">{player.name}</div>
            <div className="flex gap-2">
              {player.cards.map((pc, idx) => (
                <div key={idx} className="transform scale-75">
                  {pc.revealed ? (
                    <PlayingCard card={pc.card} />
                  ) : (
                    <CardBack />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Guessing interface */}
      {isMyTurn && (
        <div className="bg-white/20 p-6 rounded-lg backdrop-blur-sm">
          <GuessButtons cardIndex={cardIndex} onGuess={onGuess} />
        </div>
      )}
    </div>
  );
}

// Guess buttons based on card index
function GuessButtons({ cardIndex, onGuess }: { cardIndex: number; onGuess: (guess: string) => void }) {
  if (cardIndex === 0) {
    return (
      <div>
        <p className="text-white mb-4 text-xl">Is the card Red or Black?</p>
        <div className="flex gap-4">
          <Button onClick={() => onGuess('red')} className="bg-red-600 hover:bg-red-700">Red</Button>
          <Button onClick={() => onGuess('black')} className="bg-gray-900 hover:bg-black">Black</Button>
        </div>
      </div>
    );
  }

  if (cardIndex === 1) {
    return (
      <div>
        <p className="text-white mb-4 text-xl">Higher, Lower, or Same?</p>
        <div className="flex gap-4">
          <Button onClick={() => onGuess('higher')}>Higher</Button>
          <Button onClick={() => onGuess('same')}>Same</Button>
          <Button onClick={() => onGuess('lower')}>Lower</Button>
        </div>
      </div>
    );
  }

  if (cardIndex === 2) {
    return (
      <div>
        <p className="text-white mb-4 text-xl">Between or Outside?</p>
        <div className="flex gap-4">
          <Button onClick={() => onGuess('between')}>Between</Button>
          <Button onClick={() => onGuess('outside')}>Outside</Button>
        </div>
      </div>
    );
  }

  if (cardIndex === 3) {
    return (
      <div>
        <p className="text-white mb-4 text-xl">What suit?</p>
        <div className="grid grid-cols-2 gap-4">
          <Button onClick={() => onGuess('hearts')} className="bg-red-600">♥ Hearts</Button>
          <Button onClick={() => onGuess('diamonds')} className="bg-red-600">♦ Diamonds</Button>
          <Button onClick={() => onGuess('clubs')} className="bg-gray-900">♣ Clubs</Button>
          <Button onClick={() => onGuess('spades')} className="bg-gray-900">♠ Spades</Button>
        </div>
      </div>
    );
  }

  return null;
}

// Round 2: Good/Bad/Ugly (placeholder for now)
function Round2View({ gameState: _gameState }: { gameState: GameState }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-white text-2xl">
        Round 2: Good/Bad/Ugly - Coming Soon!
      </div>
    </div>
  );
}

// Round 3: Bus Driver (placeholder for now)
function Round3View({ gameState: _gameState }: { gameState: GameState }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-white text-2xl">
        Round 3: Bus Driver - Coming Soon!
      </div>
    </div>
  );
}