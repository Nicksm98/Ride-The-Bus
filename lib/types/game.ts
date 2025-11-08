export type Card = {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: 'ace' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'jack' | 'queen' | 'king';
  drawn?: boolean;
};

export type GamePhase = 
  | 'waiting'           // Waiting for game to start
  | 'round1_dealing'    // Dealing 4 cards to each player
  | 'round1_guessing'   // Players guessing their 4 cards
  | 'round2_goodbadugly' // Good/Bad/Ugly round
  | 'round3_busdriver'  // Bus driver round
  | 'finished';         // Game over

export type Round1CardIndex = 0 | 1 | 2 | 3;

export type Round1GuessType = 
  | 'red_or_black'      // Card 1: guess red or black
  | 'higher_or_lower'   // Card 2: higher or lower than card 1
  | 'between_or_outside' // Card 3: between or outside cards 1 & 2
  | 'suit';             // Card 4: guess the suit

export type GoodBadUgly = 'good' | 'bad' | 'ugly';

export type PlayerCard = {
  card: Card;
  revealed: boolean;
  guessedCorrectly?: boolean; // Whether the guess was correct (undefined if not yet revealed)
};

export type PlayerState = {
  id: string;
  name: string;
  cards: PlayerCard[];           // The 4 cards dealt in round 1
  collectedCards: Card[];        // Cards collected in round 2
  currentCardIndex: number;      // Which card (0-3) they're currently guessing
  isCurrentPlayer: boolean;      // Is it this player's turn?
  drinkCount: number;           // Track drinks for UI feedback
};

export type GameState = {
  phase: GamePhase;
  deckIds: string[];            // One or two deck IDs
  players: PlayerState[];
  currentPlayerIndex: number;   // Which player's turn in round 1
  
  // Round 2 state
  round2Index: number;          // Current position in good/bad/ugly cycle
  round2CardDrawn: Card | null; // Current card being matched
  round2OriginalMatches?: Record<string, number>; // Track original match counts per player
  round2GivenCounts?: Record<string, number>; // Track how many each player has given
  round2CurrentGiver?: string | null; // Current player giving cards/drinks
  
  // Round 3 state
  busDriverId: string | null;   // Player with most cards
  busDriverPartnerIndex: number; // Index of current partner (to right of bus driver)
  busDriverCards: Card[];       // The 5-10 cards being guessed
  busDriverCorrectGuesses: number; // How many correct guesses made
  busDriverPartnerSuggestion?: 'higher' | 'lower' | 'same' | null; // Partner's suggestion
};

export const CARD_VALUES: Record<Card['rank'], number> = {
  'ace': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  'jack': 11,
  'queen': 12,
  'king': 13
};

export function isRedCard(card: Card): boolean {
  return card.suit === 'hearts' || card.suit === 'diamonds';
}

export function getCardValue(card: Card): number {
  return CARD_VALUES[card.rank];
}