import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function POST(
  req: Request, 
  { params }: { params: { code: string; deckId: string } }
) {
  try {
    const { deckId } = params;

    const supabase = getSupabaseAdmin();

    // Draw a card
    const { data, error } = await supabase.rpc('draw_card', {
      p_deck_id: deckId
    });

    if (error) {
      console.error('Failed to draw card:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      card: data.card,
      remainingCards: data.remaining_cards
    });
  } catch (err) {
    console.error('Error drawing card:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}