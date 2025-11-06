import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

type Card = {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: 'ace' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'jack' | 'queen' | 'king';
  drawn: boolean;
};

type PlayerCard = {
  card: Omit<Card, 'drawn'>;
  revealed: boolean;
};

type GamePlayer = {
  id: string;
  name: string;
  cards: PlayerCard[];
  collectedCards: Card[];
  currentCardIndex: number;
  isCurrentPlayer: boolean;
  drinkCount: number;
};

type GameState = {
  phase: 'round1_dealing' | 'round1_guessing' | 'round2_goodbadugly' | 'round3_busdriver';
  deckIds: string[];
  players: GamePlayer[];
  currentPlayerIndex: number;
  round2Index: number;
  round2CardDrawn: Card | null;
  busDriverId: string | null;
  busDriverPartnerIndex: number;
  busDriverCards: Card[];
  busDriverCorrectGuesses: number;
};

function createShuffledDeck(): Card[] {
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
}

function dealCards(players: { id: string; name: string }[], deck: Card[]): { players: GamePlayer[], deck: Card[] } {
  const gamePlayers: GamePlayer[] = players.map((p, idx) => ({
    id: p.id,
    name: p.name,
    cards: [],
    collectedCards: [],
    currentCardIndex: 0,
    isCurrentPlayer: idx === 0,
    drinkCount: 0
  }));

  let currentDeck = [...deck];

  for (let i = 0; i < gamePlayers.length; i++) {
    const playerCards: PlayerCard[] = [];
    
    for (let j = 0; j < 4; j++) {
      const availableCards = currentDeck.filter(c => !c.drawn);
      if (availableCards.length === 0) {
        throw new Error('Not enough cards in deck');
      }
      const card = availableCards[0];
      playerCards.push({ card: { suit: card.suit, rank: card.rank }, revealed: false });
      
      // Mark the first matching card as drawn
      let cardMarked = false;
      currentDeck = currentDeck.map(c => {
        if (!cardMarked && !c.drawn && c.suit === card.suit && c.rank === card.rank) {
          cardMarked = true;
          return { ...c, drawn: true };
        }
        return c;
      });
    }
    
    gamePlayers[i].cards = playerCards;
  }

  return { players: gamePlayers, deck: currentDeck };
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await context.params;
    const codeUpper = code.toUpperCase();

    // Get lobby
    const { data: lobby, error: lobbyError } = await supabase
      .from("lobbies")
      .select("players, status")
      .eq("code", codeUpper)
      .maybeSingle();

    if (lobbyError || !lobby) {
      return NextResponse.json(
        { error: "Lobby not found" },
        { status: 404 }
      );
    }

    if (lobby.status !== 'waiting') {
      return NextResponse.json(
        { error: "Game already started" },
        { status: 400 }
      );
    }

    const players = lobby.players || [];
    if (players.length < 2) {
      return NextResponse.json(
        { error: "Need at least 2 players to start" },
        { status: 400 }
      );
    }

    // Create deck(s) based on player count
    const numDecks = players.length >= 5 ? 2 : 1;
    let combinedDeck: Card[] = [];
    for (let i = 0; i < numDecks; i++) {
      combinedDeck = [...combinedDeck, ...createShuffledDeck()];
    }

    // Deal cards to players
    const { players: gamePlayers, deck: updatedDeck } = dealCards(players, combinedDeck);

    // Create initial game state
    const gameState: GameState = {
      phase: 'round1_guessing',
      deckIds: [`deck-${Date.now()}`],
      players: gamePlayers,
      currentPlayerIndex: 0,
      round2Index: 0,
      round2CardDrawn: null,
      busDriverId: null,
      busDriverPartnerIndex: 0,
      busDriverCards: [],
      busDriverCorrectGuesses: 0
    };

    // Update lobby with game state and status
    const { error: updateError } = await supabase
      .from("lobbies")
      .update({
        status: 'in-progress',
        game_state: gameState,
        deck: updatedDeck
      })
      .eq("code", codeUpper);

    if (updateError) {
      console.error('Failed to update lobby:', updateError);
      return NextResponse.json(
        { error: `Failed to start game: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, gameState });
  } catch (err) {
    console.error("Error in start-game API:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
