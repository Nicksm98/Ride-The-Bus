import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Card } from '@/lib/types/game';

export function useDeck(_lobbyCode: string) {
  const [deckId, setDeckId] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create a new deck
  const createDeck = async () => {
    try {
      setLoading(true);
      setError(null);

      // Generate a full deck of 52 cards
      const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
      const ranks: Card['rank'][] = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
      
      const allCards: Card[] = [];
      for (const suit of suits) {
        for (const rank of ranks) {
          allCards.push({ suit, rank, drawn: false });
        }
      }

      // Shuffle the deck
      for (let i = allCards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
      }

      // Create deck ID
      const newDeckId = `deck-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      
      setDeckId(newDeckId);
      setCards(allCards);

      return newDeckId;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Draw a card from the deck
  const drawCard = async () => {
    if (!deckId) throw new Error('No active deck');

    try {
      setLoading(true);
      setError(null);

      // Find first undrawn card
      const undrawnCard = cards.find(c => !c.drawn);
      
      if (!undrawnCard) {
        throw new Error('No cards left in deck');
      }

      // Mark card as drawn
      setCards(current => 
        current.map(c => 
          c.suit === undrawnCard.suit && c.rank === undrawnCard.rank
            ? { ...c, drawn: true }
            : c
        )
      );

      const remainingCards = cards.filter(c => !c.drawn).length - 1;

      return { card: undrawnCard, remainingCards };
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Subscribe to deck changes
  const subscribeToDeck = (deckId: string) => {
    return supabase
      .channel(`deck-${deckId}`)
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE',
          schema: 'public',
          table: 'decks',
          filter: `id=eq.${deckId}`
        },
        payload => {
          try {
            setCards(payload.new.cards);
          } catch (e) {
            console.error('Failed to update cards from realtime payload', e);
          }
        }
      )
      .subscribe();
  };

  return {
    deckId,
    cards,
    loading,
    error,
    createDeck,
    drawCard,
    subscribeToDeck
  };
}