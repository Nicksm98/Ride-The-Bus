import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code: rawCode } = await params;
    const code = String(rawCode || '').toUpperCase();
    const body = await req.json();
    const playerId = String(body.playerId || '');
    const name = String(body.name || '').trim();

    if (!playerId || !name) {
      return NextResponse.json({ error: 'playerId and name are required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Get the current lobby
    const { data: lobby, error: fetchError } = await supabase
      .from('lobbies')
      .select('players')
      .eq('code', code)
      .single();

    if (fetchError || !lobby) {
      console.error('Lobby fetch error', fetchError);
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
    }

    const currentPlayers = lobby.players || [];

    if (currentPlayers.length === 0) {
      return NextResponse.json({ error: 'Lobby has no players' }, { status: 400 });
    }

    // Find and update the player
    const playerIndex = currentPlayers.findIndex((p: { id: string }) => p.id === playerId);
    
    if (playerIndex === -1) {
      return NextResponse.json({ error: 'Player not found in lobby' }, { status: 404 });
    }

    // Update the player's name
    const updatedPlayers = currentPlayers.map((p: { id: string; name: string }) => 
      p.id === playerId ? { ...p, name } : p
    );

    // Save back to database
    const { error: updateError } = await supabase
      .from('lobbies')
      .update({ players: updatedPlayers })
      .eq('code', code);

    if (updateError) {
      console.error('Failed to update lobby', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ players: updatedPlayers });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
