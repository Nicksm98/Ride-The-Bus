import type { Card } from '@/lib/types/game';

export function PlayingCard({ card }: { card: Card }) {
  const suitSymbol = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠'
  }[card.suit];

  const displayRank = card.rank === 'ace' ? 'A' :
    card.rank === 'jack' ? 'J' :
    card.rank === 'queen' ? 'Q' :
    card.rank === 'king' ? 'K' :
    card.rank;

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';

  return (
    <div className="relative w-24 h-36 rounded-lg bg-white shadow-lg border-2 border-gray-200 flex items-center justify-center">
      <div className={`text-2xl font-bold ${isRed ? 'text-red-600' : 'text-black'}`}>
        <div className="absolute top-2 left-2">
          {displayRank}
          <div className="text-xl">{suitSymbol}</div>
        </div>
        <div className="text-4xl">{suitSymbol}</div>
        <div className="absolute bottom-2 right-2 rotate-180">
          {displayRank}
          <div className="text-xl">{suitSymbol}</div>
        </div>
      </div>
    </div>
  );
}

export function CardBack() {
  return (
    <div className="w-24 h-36 rounded-lg bg-gradient-to-br from-blue-600 to-blue-800 shadow-lg border-2 border-gray-200 flex items-center justify-center">
      <div className="w-20 h-32 rounded-lg border-4 border-white/30 bg-blue-700/50 flex items-center justify-center">
        <div className="text-white/40 text-6xl font-bold">🂠</div>
      </div>
    </div>
  );
}