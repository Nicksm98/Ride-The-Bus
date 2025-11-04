import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: Request, { params }: { params: { code: string } }) {
  try {
    const code = String(params.code || '').toUpperCase();

    const supabase = getSupabaseAdmin();

    // Create a new deck
    const { data, error } = await supabase.rpc('create_deck', {
      p_lobby_code: code
    });

    if (error) {
      console.error('Failed to create deck:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      deckId: data.deck_id,
      cards: data.cards
    });
  } catch (err) {
    console.error('Error creating deck:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}