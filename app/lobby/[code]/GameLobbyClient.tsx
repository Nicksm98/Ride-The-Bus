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
    
    // Mark ONLY THE FIRST matching card as drawn (important for 2-deck games)
    setDeck(current => {
      let cardMarked = false;
      return current.map(c => {
        if (!cardMarked && !c.drawn && c.suit === card.suit && c.rank === card.rank) {
          cardMarked = true;
          return { ...c, drawn: true };
        }
        return c;
      });
    });
    
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
      console.log(`Created deck with ${combinedDeck.length} cards for ${players.length} players`);

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
        
        // Mark ONLY THE FIRST matching card as drawn (important for 2-deck games)
        let cardMarked = false;
        currentDeck = currentDeck.map(c => {
          if (!cardMarked && !c.drawn && c.suit === card.suit && c.rank === card.rank) {
            cardMarked = true;
            return { ...c, drawn: true };
          }
          return c;
        });
      }
      
      updatedPlayers[i].cards = playerCards;
    }

    // Update deck state
    setDeck(currentDeck);
    
    const drawnCount = currentDeck.filter(c => c.drawn).length;
    const undrawnCount = currentDeck.filter(c => !c.drawn).length;
    console.log(`After dealing: ${currentDeck.length} total cards (${drawnCount} drawn, ${undrawnCount} undrawn)`);

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

  // Round 2: Draw a card and handle Good/Bad/Ugly
  const handleRound2DrawCard = useCallback(() => {
    if (!gameState || gameState.phase !== 'round2_goodbadugly') return;

    try {
      // Check if deck is empty BEFORE trying to draw - if so, move to round 3
      const remainingCards = deck.filter(c => !c.drawn);
      if (remainingCards.length === 0) {
        // Determine bus driver (player with most cards in hand)
        const playerCardCounts = gameState.players.map(p => ({
          ...p,
          totalCards: p.cards.length // Count cards in hand, not collected cards
        }));
        const busDriver = playerCardCounts.reduce((max, p) => 
          p.totalCards > max.totalCards ? p : max
        );

        // Collect ALL cards from the deck array (both drawn and undrawn)
        // The deck array contains all 104 cards (for 5 players), with some marked as drawn
        // We reset all cards to undrawn for Round 3
        console.log(`Before Round 3: deck array has ${deck.length} cards (${deck.filter(c => c.drawn).length} drawn, ${deck.filter(c => !c.drawn).length} undrawn)`);
        console.log(`Players have ${gameState.players.reduce((sum, p) => sum + p.cards.length, 0)} cards total in hands`);
        
        const allCards: Card[] = deck.map(card => ({ ...card, drawn: false }));
        
        // Shuffle all cards
        const shuffledCards = [...allCards].sort(() => Math.random() - 0.5);
        
        console.log(`Round 3 starting with ${shuffledCards.length} cards in deck (all from deck array)`);
        console.log('All cards marked as undrawn:', shuffledCards.filter(c => !c.drawn).length);
        
        setDeck(shuffledCards);

        // Clear all players' cards
        const playersWithoutCards = gameState.players.map(p => ({
          ...p,
          cards: []
        }));

        setGameState({
          ...gameState,
          players: playersWithoutCards,
          phase: 'round3_busdriver',
          busDriverId: busDriver.id,
          busDriverPartnerIndex: 0,
          busDriverCards: [],
          busDriverCorrectGuesses: 0
        });
        return;
      }

      // Draw a card
      const drawnCard = drawCardFromDeck();
      
      // Determine Good/Bad/Ugly
      const cycle: ('good' | 'bad' | 'ugly')[] = ['good', 'bad', 'ugly'];
      const currentAction = cycle[gameState.round2Index % 3];

      setGameState({
        ...gameState,
        round2CardDrawn: drawnCard,
        round2Index: gameState.round2Index + 1
      });
    } catch (err) {
      console.error('Failed to draw card:', err);
    }
  }, [gameState, deck, drawCardFromDeck]);

  // Round 2: Handle card action (give drinks for good, transfer cards for ugly, collect for bad)
  const handleRound2Action = useCallback((fromPlayerId: string, toPlayerId?: string, shouldClearCard?: boolean) => {
    if (!gameState || !gameState.round2CardDrawn) return;

    const cycle: ('good' | 'bad' | 'ugly')[] = ['good', 'bad', 'ugly'];
    const currentAction = cycle[(gameState.round2Index - 1) % 3];
    
    // Good cards: player chooses who drinks, NO card modifications
    if (currentAction === 'good' && toPlayerId) {
      setGameState({
        ...gameState,
        round2CardDrawn: shouldClearCard ? null : gameState.round2CardDrawn
      });
      return;
    }

    // Bad cards: player drinks, NO card modifications
    if (currentAction === 'bad') {
      setGameState({
        ...gameState,
        round2CardDrawn: null
      });
      return;
    }

    // Ugly cards: transfer the matching card from giver to recipient
    if (currentAction === 'ugly' && toPlayerId) {
      const givingPlayer = gameState.players.find(p => p.id === fromPlayerId);
      if (!givingPlayer) {
        console.error('Giving player not found:', fromPlayerId);
        return;
      }
      
      // Find the first card that matches the rank of the drawn card
      const matchingCardIndex = givingPlayer.cards.findIndex(pc => pc.card.rank === gameState.round2CardDrawn!.rank);
      if (matchingCardIndex === -1) {
        console.error('No matching card found for rank:', gameState.round2CardDrawn!.rank);
        return;
      }
      
      const cardToTransfer = givingPlayer.cards[matchingCardIndex];
      console.log('Transferring ugly card:', {
        from: givingPlayer.name,
        to: gameState.players.find(p => p.id === toPlayerId)?.name,
        card: cardToTransfer.card,
        fromCardsCount: givingPlayer.cards.length
      });

      const updatedPlayers = gameState.players.map(p => {
        if (p.id === fromPlayerId) {
          // Remove the specific matching card from the giver's hand
          const newCards = p.cards.filter((_, idx) => idx !== matchingCardIndex);
          console.log('Giver after removal:', { name: p.name, cardsCount: newCards.length });
          return {
            ...p,
            cards: newCards
          };
        } else if (p.id === toPlayerId) {
          // Add the transferred card to the recipient's hand (revealed)
          const newCards = [...p.cards, { card: cardToTransfer.card, revealed: true }];
          console.log('Recipient after adding:', { name: p.name, cardsCount: newCards.length });
          return {
            ...p,
            cards: newCards
          };
        }
        return p;
      });

      setGameState({
        ...gameState,
        players: updatedPlayers,
        round2CardDrawn: shouldClearCard ? null : gameState.round2CardDrawn
      });
      return;
    }
  }, [gameState]);

  // Round 3: Guess suit of first card
  const handleRound3GuessSuit = useCallback((suit: Card['suit']) => {
    if (!gameState) return;

    try {
      const card = drawCardFromDeck();
      const isCorrect = card.suit === suit;

      if (isCorrect) {
        // Correct: give out 2 drinks (handled in UI), increment correct guesses
        setGameState({
          ...gameState,
          busDriverCards: [card],
          busDriverCorrectGuesses: 1
        });
      } else {
        // Wrong: bus driver drinks, but still place the card and continue
        setShowDrinkPrompt(true);
        setTimeout(() => setShowDrinkPrompt(false), 2000);
        
        // Place the card on the table with 0 correct guesses, continue to higher/lower
        setGameState({
          ...gameState,
          busDriverCards: [card],
          busDriverCorrectGuesses: 0
        });
      }
    } catch (err) {
      console.error('Failed to draw card:', err);
    }
  }, [gameState, drawCardFromDeck, deck]);

  // Round 3: Guess higher/lower/same
  const handleRound3GuessHigherLowerSame = useCallback((guess: 'higher' | 'lower' | 'same') => {
    if (!gameState || gameState.busDriverCards.length === 0) return;

    try {
      // Check if we need to reshuffle BEFORE drawing
      const availableCards = deck.filter(c => !c.drawn);
      if (availableCards.length === 0) {
        console.log(`Deck empty! Reshuffling...`);
        // Keep only the most recent card on the table, reshuffle all others back into deck
        const cardsToKeep = gameState.busDriverCards.slice(-1); // Last 1 card stays on table
        const cardsToReshuffle = gameState.busDriverCards
          .slice(0, -1) // All cards except the last 1
          .map(c => ({ ...c, drawn: false })); // Mark as undrawn
        const shuffled = [...cardsToReshuffle].sort(() => Math.random() - 0.5);
        
        console.log(`Reshuffled ${cardsToReshuffle.length} cards back into deck, kept ${cardsToKeep.length} card on table.`);
        
        // Update deck with reshuffled cards
        setDeck(shuffled);
        
        // Update game state to keep only the most recent card on table
        setGameState({
          ...gameState,
          busDriverCards: cardsToKeep
        });
        
        // Return early - they need to make another guess with the refreshed deck
        return;
      }

      const card = drawCardFromDeck();
      const lastCard = gameState.busDriverCards[gameState.busDriverCards.length - 1];
      const lastValue = getCardValue(lastCard);
      const newValue = getCardValue(card);

      let isCorrect = false;
      if (guess === 'higher') isCorrect = newValue > lastValue;
      else if (guess === 'lower') isCorrect = newValue < lastValue;
      else if (guess === 'same') isCorrect = newValue === lastValue;

      if (isCorrect) {
        // Correct guess
        const newCards = [...gameState.busDriverCards, card];
        const newCorrectCount = gameState.busDriverCorrectGuesses + 1;

        setGameState({
          ...gameState,
          busDriverCards: newCards,
          busDriverCorrectGuesses: newCorrectCount
        });

        // Check if they've won (10 correct guesses total)
        if (newCorrectCount >= 10) {
          console.log('Bus driver round complete!');
        }
      } else {
        // Wrong guess - bus driver and partner drink, move to next partner
        setShowDrinkPrompt(true);
        setTimeout(() => setShowDrinkPrompt(false), 2000);

        // Add the wrong card to the table, move to next partner, reset correct count
        const newCards = [...gameState.busDriverCards, card];
        setGameState({
          ...gameState,
          busDriverCards: newCards,
          busDriverCorrectGuesses: 0,
          busDriverPartnerIndex: gameState.busDriverPartnerIndex + 1
        });
      }
    } catch (err) {
      console.error('Failed to draw card:', err);
    }
  }, [gameState, drawCardFromDeck, deck]);

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
            <div className="flex gap-3">
              <Button 
                onClick={() => window.location.href = `/pre-game-lobby/${code}?playerId=${currentPlayerId}`} 
                variant="outline"
                className="flex-1"
              >
                Back to Lobby
              </Button>
              <Button onClick={startGame} className="flex-1">
                Start Game
              </Button>
            </div>
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
          onRound2DrawCard={handleRound2DrawCard}
          onRound2SelectPlayer={handleRound2Action}
          onRound3GuessSuit={handleRound3GuessSuit}
          onRound3GuessHigherLowerSame={handleRound3GuessHigherLowerSame}
          deckCardsRemaining={deck.filter(c => !c.drawn).length}
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
  onRound1Guess,
  onRound2DrawCard,
  onRound2SelectPlayer,
  onRound3GuessSuit,
  onRound3GuessHigherLowerSame,
  deckCardsRemaining
}: { 
  gameState: GameState;
  currentPlayerId: string | null;
  onRound1Guess: (guess: string) => void;
  onRound2DrawCard: () => void;
  onRound2SelectPlayer: (fromPlayerId: string, toPlayerId?: string, shouldClearCard?: boolean) => void;
  onRound3GuessSuit: (suit: Card['suit']) => void;
  onRound3GuessHigherLowerSame: (guess: 'higher' | 'lower' | 'same') => void;
  deckCardsRemaining: number;
}) {
  if (gameState.phase === 'round1_guessing') {
    return <Round1View 
      gameState={gameState} 
      currentPlayerId={currentPlayerId}
      onGuess={onRound1Guess}
      deckCardsRemaining={deckCardsRemaining}
    />;
  }

  if (gameState.phase === 'round2_goodbadugly') {
    return <Round2View 
      gameState={gameState}
      currentPlayerId={currentPlayerId}
      onDrawCard={onRound2DrawCard}
      onSelectPlayer={onRound2SelectPlayer}
      deckCardsRemaining={deckCardsRemaining}
    />;
  }

  if (gameState.phase === 'round3_busdriver') {
    return <Round3View 
      gameState={gameState}
      currentPlayerId={currentPlayerId}
      onGuessSuit={onRound3GuessSuit}
      onGuessHigherLowerSame={onRound3GuessHigherLowerSame}
      onDrinksPenalty={() => {}}
      deckCardsRemaining={deckCardsRemaining}
    />;
  }

  return <div className="text-white">Game Phase: {gameState.phase}</div>;
}

// Round 1: Individual card guessing
function Round1View({ 
  gameState, 
  currentPlayerId,
  onGuess,
  deckCardsRemaining
}: { 
  gameState: GameState;
  currentPlayerId: string | null;
  onGuess: (guess: string) => void;
  deckCardsRemaining: number;
}) {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const isMyTurn = currentPlayer.id === currentPlayerId;
  const cardIndex = currentPlayer.currentCardIndex;

  return (
    <div className="flex flex-col items-center justify-between h-full py-2 relative">
      {/* Deck indicator in top left */}
      <div className="absolute top-2 left-2">
        <div className="relative transform scale-50 origin-top-left">
          <CardBack />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-black/80 text-white font-bold text-2xl px-4 py-2 rounded border-2 border-white">
              {deckCardsRemaining}
            </div>
          </div>
        </div>
      </div>

      <h2 className="text-white text-2xl mb-4">
        {isMyTurn ? "Your Turn!" : `${currentPlayer.name}'s Turn`}
      </h2>

      {/* Show all players and their cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {gameState.players.map(player => (
          <div key={player.id} className={`bg-white/10 rounded-lg p-2 max-w-[400px] ${player.isCurrentPlayer ? 'ring-2 ring-yellow-400' : ''}`}>
            <div className="text-white font-bold text-xs mb-1">{player.name}</div>
            <div className="flex flex-wrap h-[150px] overflow-hidden">
              {player.cards.map((pc, idx) => (
                <div key={idx} className="transform scale-[0.40] origin-top-left -mr-8 -mb-16">
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
        <div className="bg-white/20 p-4 rounded-lg backdrop-blur-sm">
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
        <p className="text-white mb-3 text-lg">Is the card Red or Black?</p>
        <div className="flex gap-3">
          <Button onClick={() => onGuess('red')} className="bg-red-600 hover:bg-red-700">Red</Button>
          <Button onClick={() => onGuess('black')} className="bg-gray-900 hover:bg-black">Black</Button>
        </div>
      </div>
    );
  }

  if (cardIndex === 1) {
    return (
      <div>
        <p className="text-white mb-3 text-lg">Higher, Lower, or Same?</p>
        <div className="flex gap-3">
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
        <p className="text-white mb-3 text-lg">Between or Outside?</p>
        <div className="flex gap-3">
          <Button onClick={() => onGuess('between')}>Between</Button>
          <Button onClick={() => onGuess('outside')}>Outside</Button>
        </div>
      </div>
    );
  }

  if (cardIndex === 3) {
    return (
      <div>
        <p className="text-white mb-3 text-lg">What suit?</p>
        <div className="grid grid-cols-2 gap-3">
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

// Round 2: Good/Bad/Ugly
function Round2View({ 
  gameState, 
  currentPlayerId,
  onDrawCard,
  onSelectPlayer,
  deckCardsRemaining
}: { 
  gameState: GameState;
  currentPlayerId: string | null;
  onDrawCard: () => void;
  onSelectPlayer: (fromPlayerId: string, toPlayerId?: string, shouldClearCard?: boolean) => void;
  deckCardsRemaining: number;
}) {
  const [uglyCardFromPlayer, setUglyCardFromPlayer] = React.useState<string | null>(null);
  const [uglyCardsGiven, setUglyCardsGiven] = React.useState<Set<string>>(new Set());
  const [goodCardFromPlayer, setGoodCardFromPlayer] = React.useState<string | null>(null);
  const [goodCardsGiven, setGoodCardsGiven] = React.useState<Set<string>>(new Set());
  // Track which players received cards this round (so they can't give those away)
  const [cardsReceivedThisRound, setCardsReceivedThisRound] = React.useState<Set<string>>(new Set());
  
  const cycle: ('good' | 'bad' | 'ugly')[] = ['good', 'bad', 'ugly'];
  // If card is drawn, use the action from when it was drawn (index - 1)
  // If no card drawn, show the NEXT action that will happen
  const currentAction = gameState.round2CardDrawn 
    ? cycle[(gameState.round2Index - 1) % 3]
    : cycle[gameState.round2Index % 3];
  
  // Get players with matching cards (excluding cards they just received this round)
  const playersWithMatch = gameState.round2CardDrawn
    ? gameState.players.filter(p => {
        // Count how many cards match the drawn card rank
        const matchingCards = p.cards.filter(pc => pc.card.rank === gameState.round2CardDrawn!.rank);
        // If this player received a card this round, they need at least 2 matches (one to keep, one to give)
        if (cardsReceivedThisRound.has(p.id)) {
          return matchingCards.length > 1;
        }
        // Otherwise they just need at least 1 match
        return matchingCards.length > 0;
      })
    : [];
  
  const playersWithUglyMatch = currentAction === 'ugly' ? playersWithMatch : [];
  const playersWithGoodMatch = currentAction === 'good' ? playersWithMatch : [];
  
  const allUglyCardsGiven = playersWithUglyMatch.every(p => uglyCardsGiven.has(p.id));
  const allGoodCardsGiven = playersWithGoodMatch.every(p => goodCardsGiven.has(p.id));
  
  // Reset cards given when new card is drawn
  React.useEffect(() => {
    if (!gameState.round2CardDrawn) {
      setUglyCardsGiven(new Set());
      setUglyCardFromPlayer(null);
      setGoodCardsGiven(new Set());
      setGoodCardFromPlayer(null);
      setCardsReceivedThisRound(new Set());
    }
  }, [gameState.round2CardDrawn]);
  
  const actionColors = {
    good: 'text-green-400',
    bad: 'text-red-400',
    ugly: 'text-yellow-400'
  };

  const actionDescriptions = {
    good: 'If you have a match, give out a drink!',
    bad: 'If you have a match, take a drink!',
    ugly: 'If you have a match, give your card to someone!'
  };

  return (
    <div className="flex flex-col items-center justify-between h-full py-2 relative">
      {/* Deck indicator in top left */}
      <div className="absolute top-2 left-2">
        <div className="relative transform scale-50 origin-top-left">
          <CardBack />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-black/80 text-white font-bold text-2xl px-4 py-2 rounded border-2 border-white">
              {deckCardsRemaining}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-center">
          <h2 className="text-white text-2xl mb-2">Round 2: Good, Bad, Ugly</h2>
          
          {/* Current action */}
          <div className={`text-3xl font-bold mb-1 ${actionColors[currentAction]}`}>
            {currentAction.toUpperCase()}
          </div>
          <p className="text-white text-sm mb-2">{actionDescriptions[currentAction]}</p>

          {/* Draw button if no card */}
          {!gameState.round2CardDrawn && (
            <Button onClick={onDrawCard} size="sm" className="mb-2">
              Draw Card
            </Button>
          )}

          {/* Continue button when no matches OR when all cards given */}
          {gameState.round2CardDrawn && !uglyCardFromPlayer && !goodCardFromPlayer && (
            (
              !gameState.players.some(p => 
                p.cards.some(pc => pc.card.rank === gameState.round2CardDrawn!.rank)
              ) ||
              (currentAction === 'ugly' && allUglyCardsGiven) ||
              (currentAction === 'good' && allGoodCardsGiven)
            ) && (
              <Button onClick={onDrawCard} size="sm" className="mb-2">
                {currentAction === 'ugly' && playersWithUglyMatch.length > 0 ? 
                   `Draw Next Card (${uglyCardsGiven.size}/${playersWithUglyMatch.length} given)` :
                 currentAction === 'good' && playersWithGoodMatch.length > 0 ? 
                   `Draw Next Card (${goodCardsGiven.size}/${playersWithGoodMatch.length} given)` :
                   'No Matches - Continue'}
              </Button>
            )
          )}

          {/* Bad card: Click to continue */}
          {gameState.round2CardDrawn && currentAction === 'bad' && gameState.players.some(p => 
            p.cards.some(pc => pc.card.rank === gameState.round2CardDrawn!.rank)
          ) && (
            <Button onClick={() => onSelectPlayer('', undefined)} size="sm" className="mb-2">
              Draw Next Card
            </Button>
          )}
        </div>

        {/* Current card next to title */}
        {gameState.round2CardDrawn && (
          <div className="transform scale-75">
            <PlayingCard card={gameState.round2CardDrawn} />
          </div>
        )}

        {/* Show message when selecting Ugly card recipient */}
        {uglyCardFromPlayer && currentAction === 'ugly' && (
          <div className="text-white text-lg ml-4">
            {gameState.players.find(p => p.id === uglyCardFromPlayer)?.name} - Select who receives your card
          </div>
        )}

        {/* Show message when selecting Good card recipient */}
        {goodCardFromPlayer && currentAction === 'good' && (
          <div className="text-white text-lg ml-4">
            {gameState.players.find(p => p.id === goodCardFromPlayer)?.name} - Select who takes a drink
          </div>
        )}
      </div>

      {/* Player cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {gameState.players.map(player => {
          const hasMatch = gameState.round2CardDrawn && 
            player.cards.some(pc => pc.card.rank === gameState.round2CardDrawn!.rank);
          
          return (
            <div 
              key={player.id}
              className={`bg-white/10 p-2 rounded-lg max-w-[400px] min-h-[220px] flex flex-col justify-between ${hasMatch ? 'ring-2 ring-yellow-400' : ''}`}
            >
              <div>
                <div className="text-white font-bold text-xs mb-1">{player.name}</div>
                
                {/* Show player's cards in rows of 5 */}
                <div className="flex flex-col overflow-visible mb-1">
                  {Array.from({ length: Math.ceil(player.cards.length / 5) }).map((_, rowIdx) => (
                    <div key={rowIdx} className="flex h-[75px] overflow-visible">
                      {player.cards.slice(rowIdx * 5, rowIdx * 5 + 5).map((pc, idx) => (
                        <div key={rowIdx * 5 + idx} className="transform scale-[0.35] origin-top-left -mr-14">
                          <PlayingCard card={pc.card} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Button area - will be pushed to bottom */}
              <div>

              {/* Action button if card matches (only for good/ugly, not bad) */}
              {hasMatch && gameState.round2CardDrawn && !uglyCardFromPlayer && !goodCardFromPlayer && currentAction !== 'bad' && (
                (() => {
                  // For ugly cards, only show button for the first player who hasn't given yet
                  if (currentAction === 'ugly') {
                    const playersWithUglyMatch = playersWithMatch;
                    const firstUnprocessedPlayer = playersWithUglyMatch.find(p => !uglyCardsGiven.has(p.id));
                    const isMyTurn = firstUnprocessedPlayer?.id === player.id;
                    const isMyHand = player.id === currentPlayerId;
                    
                    if (!isMyTurn) {
                      // Show waiting indicator for players who have already given or aren't next
                      if (uglyCardsGiven.has(player.id)) {
                        return (
                          <div className="mt-1 text-green-400 text-xs font-bold text-center">
                            ✓ Card Given
                          </div>
                        );
                      } else {
                        return (
                          <div className="mt-1 text-gray-400 text-xs text-center">
                            Waiting...
                          </div>
                        );
                      }
                    }
                    
                    // Only show button if this is my hand
                    if (!isMyHand) {
                      return (
                        <div className="mt-1 text-yellow-400 text-xs text-center">
                          {player.name}&apos;s Turn
                        </div>
                      );
                    }
                  }
                  
                  // For good cards, only show button for the first player who hasn't given yet
                  if (currentAction === 'good') {
                    const playersWithGoodMatch = playersWithMatch;
                    const firstUnprocessedPlayer = playersWithGoodMatch.find(p => !goodCardsGiven.has(p.id));
                    const isMyTurn = firstUnprocessedPlayer?.id === player.id;
                    const isMyHand = player.id === currentPlayerId;
                    
                    if (!isMyTurn) {
                      // Show waiting indicator for players who have already given or aren't next
                      if (goodCardsGiven.has(player.id)) {
                        return (
                          <div className="mt-1 text-green-400 text-xs font-bold text-center">
                            ✓ Drink Given
                          </div>
                        );
                      } else {
                        return (
                          <div className="mt-1 text-gray-400 text-xs text-center">
                            Waiting...
                          </div>
                        );
                      }
                    }
                    
                    // Only show button if this is my hand
                    if (!isMyHand) {
                      return (
                        <div className="mt-1 text-yellow-400 text-xs text-center">
                          {player.name}&apos;s Turn
                        </div>
                      );
                    }
                  }
                  
                  return (
                    <Button 
                      onClick={() => {
                        if (currentAction === 'ugly') {
                          setUglyCardFromPlayer(player.id);
                        } else if (currentAction === 'good') {
                          setGoodCardFromPlayer(player.id);
                        }
                      }}
                      size="sm"
                      className="mt-1 w-full text-xs py-1"
                      variant={currentAction === 'good' ? 'default' : 'secondary'}
                    >
                      {currentAction === 'good' && 'Choose Drinker'}
                      {currentAction === 'ugly' && 'Give Card'}
                    </Button>
                  );
                })()
              )}

              {/* Show indicator for bad card match */}
              {hasMatch && gameState.round2CardDrawn && currentAction === 'bad' && (
                <div className="mt-1 text-red-400 text-xs font-bold text-center">
                  DRINK! 🍺
                </div>
              )}

              {/* Good: Select who drinks */}
              {goodCardFromPlayer && currentAction === 'good' && player.id !== goodCardFromPlayer && (
                <Button 
                  onClick={() => {
                    const newGoodCardsGiven = new Set([...goodCardsGiven, goodCardFromPlayer]);
                    const willBeComplete = playersWithGoodMatch.every(p => newGoodCardsGiven.has(p.id));
                    onSelectPlayer(goodCardFromPlayer, player.id, willBeComplete);
                    setGoodCardsGiven(newGoodCardsGiven);
                    setGoodCardFromPlayer(null);
                  }}
                  size="sm"
                  className="mt-1 w-full text-xs py-1"
                  variant="default"
                >
                  Give Drink to {player.name}
                </Button>
              )}

              {/* Ugly: Select who receives card */}
              {uglyCardFromPlayer && currentAction === 'ugly' && player.id !== uglyCardFromPlayer && (
                <Button 
                  onClick={() => {
                    const newUglyCardsGiven = new Set([...uglyCardsGiven, uglyCardFromPlayer]);
                    const willBeComplete = playersWithUglyMatch.every(p => newUglyCardsGiven.has(p.id));
                    onSelectPlayer(uglyCardFromPlayer, player.id, willBeComplete);
                    setUglyCardsGiven(newUglyCardsGiven);
                    setUglyCardFromPlayer(null);
                    // Track that THIS player (the recipient) received a card this round
                    setCardsReceivedThisRound(prev => new Set([...prev, player.id]));
                  }}
                  size="sm"
                  className="mt-1 w-full text-xs py-1"
                  variant="secondary"
                >
                  Give Card to {player.name}
                </Button>
              )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Round 3: Bus Driver
function Round3View({ 
  gameState,
  currentPlayerId,
  onGuessSuit,
  onGuessHigherLowerSame,
  onDrinksPenalty: _onDrinksPenalty,
  deckCardsRemaining
}: { 
  gameState: GameState;
  currentPlayerId: string | null;
  onGuessSuit: (suit: Card['suit']) => void;
  onGuessHigherLowerSame: (guess: 'higher' | 'lower' | 'same') => void;
  onDrinksPenalty: () => void;
  deckCardsRemaining: number;
}) {
  const [showDrinkDistribution, setShowDrinkDistribution] = React.useState(false);

  const busDriver = gameState.players.find(p => p.id === gameState.busDriverId);
  const isBusDriver = gameState.busDriverId === currentPlayerId;
  
  // Get all players except the bus driver
  const otherPlayers = gameState.players.filter(p => p.id !== gameState.busDriverId);
  const partner = otherPlayers[gameState.busDriverPartnerIndex % otherPlayers.length];
  
  const totalCardsNeeded = 10; // 10 correct guesses to win
  const progress = (gameState.busDriverCorrectGuesses / totalCardsNeeded) * 100;

  // Determine current phase
  const isGuessingFirstCard = gameState.busDriverCards.length === 0;
  const needsHigherLowerGuess = gameState.busDriverCards.length > 0 && gameState.busDriverCorrectGuesses < totalCardsNeeded;

  // Show drink distribution after correct suit guess
  React.useEffect(() => {
    if (gameState.busDriverCards.length === 1 && gameState.busDriverCorrectGuesses === 1) {
      setShowDrinkDistribution(true);
    } else {
      setShowDrinkDistribution(false);
    }
  }, [gameState.busDriverCards.length, gameState.busDriverCorrectGuesses]);

  return (
    <div className="flex flex-col items-center justify-between h-full py-2 relative">
      {/* Deck indicator in top left */}
      <div className="absolute top-2 left-2">
        <div className="relative transform scale-50 origin-top-left">
          <CardBack />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-black/80 text-white font-bold text-2xl px-4 py-2 rounded border-2 border-white">
              {deckCardsRemaining}
            </div>
          </div>
        </div>
      </div>

      <h2 className="text-white text-2xl mb-2">Round 3: Riding the Bus</h2>
      
      {/* Bus Driver Info */}
      <div className="bg-white/10 p-3 rounded-lg mb-2 text-center">
        <div className="text-white text-lg font-bold mb-1">
          🚌 {busDriver?.name} | Partner: {partner?.name} 🤝
        </div>
        
        {/* Progress bar */}
        <div className="w-48 bg-gray-700 rounded-full h-3 mb-1 mx-auto">
          <div 
            className="bg-green-500 h-3 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-white text-xs">
          {gameState.busDriverCorrectGuesses} / {totalCardsNeeded} correct
        </div>
      </div>

      {/* Cards on table - show only last 5 */}
      <div className="flex gap-2 mb-2">
        {gameState.busDriverCards.slice(-5).map((card, idx) => (
          <div key={idx} className="transform scale-75">
            <PlayingCard card={card} />
          </div>
        ))}
        {gameState.busDriverCards.length < 5 && (
          <div className="w-18 h-27 scale-75 rounded-lg border-2 border-dashed border-white/30 flex items-center justify-center">
            <span className="text-white/50 text-2xl">?</span>
          </div>
        )}
      </div>

      {/* Instructions and guess buttons */}
      {isGuessingFirstCard && (
        <div className="bg-white/20 p-3 rounded-lg backdrop-blur-sm text-center">
          <p className="text-white text-sm mb-2">
            {busDriver?.name}, guess the suit!
          </p>
          <p className="text-white/70 text-xs mb-3">
            Correct: Give 2 drinks | Wrong: Drink once
          </p>
          {isBusDriver ? (
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => onGuessSuit('hearts')} size="sm" className="bg-red-600 text-white text-xs py-1">
                ♥ Hearts
              </Button>
              <Button onClick={() => onGuessSuit('diamonds')} size="sm" className="bg-red-600 text-white text-xs py-1">
                ♦ Diamonds
              </Button>
              <Button onClick={() => onGuessSuit('clubs')} size="sm" className="bg-gray-900 text-white text-xs py-1">
                ♣ Clubs
              </Button>
              <Button onClick={() => onGuessSuit('spades')} size="sm" className="bg-gray-900 text-white text-xs py-1">
                ♠ Spades
              </Button>
            </div>
          ) : (
            <p className="text-yellow-400 text-sm">Waiting for {busDriver?.name} to guess...</p>
          )}
        </div>
      )}

      {/* Drink distribution after correct suit guess */}
      {showDrinkDistribution && (
        <div className="bg-green-600/20 p-3 rounded-lg backdrop-blur-sm text-center border-2 border-green-400 mb-2">
          <p className="text-green-400 text-lg font-bold mb-1">
            ✓ Correct!
          </p>
          <p className="text-white text-sm mb-2">
            {busDriver?.name}, distribute 2 drinks
          </p>
          <Button 
            onClick={() => setShowDrinkDistribution(false)}
            variant="default"
            size="sm"
            className="text-xs"
          >
            Drinks Distributed - Continue
          </Button>
        </div>
      )}

      {needsHigherLowerGuess && !showDrinkDistribution && (
        <div className="bg-white/20 p-3 rounded-lg backdrop-blur-sm text-center">
          <p className="text-white text-sm mb-2">
            Higher, Lower, or Same?
          </p>
          <p className="text-white/70 text-xs mb-3">
            Current: {gameState.busDriverCards[gameState.busDriverCards.length - 1].rank.toUpperCase()}
          </p>
          {isBusDriver ? (
            <div className="flex gap-2 justify-center">
              <Button onClick={() => onGuessHigherLowerSame('higher')} size="sm" className="bg-green-600 text-xs py-1">
                ⬆️ Higher
              </Button>
              <Button onClick={() => onGuessHigherLowerSame('same')} size="sm" className="bg-yellow-600 text-xs py-1">
                = Same
              </Button>
              <Button onClick={() => onGuessHigherLowerSame('lower')} size="sm" className="bg-blue-600 text-xs py-1">
                ⬇️ Lower
              </Button>
            </div>
          ) : (
            <p className="text-yellow-400 text-sm">Waiting for {busDriver?.name} to guess...</p>
          )}
        </div>
      )}

      {/* Success message */}
      {gameState.busDriverCorrectGuesses >= totalCardsNeeded && (
        <div className="bg-green-600 p-4 rounded-lg text-center">
          <div className="text-white text-2xl font-bold mb-2">
            🎉 Success! 🎉
          </div>
          <p className="text-white text-sm mb-3">
            {busDriver?.name} and {partner?.name} completed the bus ride!
          </p>
          <Button onClick={() => window.location.reload()} size="sm">
            Play Again
          </Button>
        </div>
      )}

      {/* All players */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 w-full">
        {gameState.players.map((player) => {
          const isPartner = player.id === partner?.id;
          return (
            <div 
              key={player.id}
              className={`bg-white/10 p-2 rounded-lg ${
                player.id === gameState.busDriverId ? 'ring-2 ring-yellow-400' :
                isPartner ? 'ring-2 ring-blue-400' : ''
              }`}
            >
              <div className="text-white font-bold text-xs">
                {player.name}
                {player.id === gameState.busDriverId && ' 🚌'}
                {isPartner && ' 🤝'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}