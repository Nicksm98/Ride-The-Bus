import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code: rawCode } = await params;
    const code = String(rawCode || '').toUpperCase();
    const body = await req.json();
    const botId = String(body.botId || '');

    if (!code || !botId) {
      return NextResponse.json({ error: 'Missing code or botId' }, { status: 400 });
    }

    // Only allow deleting bot players
    if (!botId.startsWith('bot-')) {
      return NextResponse.json({ error: 'Can only remove bot players' }, { status: 400 });
    }

    const supabase = await getSupabaseAdmin();

    // Fetch the lobby
    const { data: lobby, error: fetchError } = await supabase
      .from('lobbies')
      .select('players')
      .eq('code', code)
      .single();

    if (fetchError || !lobby) {
      console.error('Lobby fetch error', fetchError);
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
    }

    const players = (lobby.players || []) as Array<{ id: string; name: string }>;
    
    // Remove the bot
    const updatedPlayers = players.filter(p => p.id !== botId);

    if (updatedPlayers.length === players.length) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    // Update the lobby
    const { data: updated, error: updateError } = await supabase
      .from('lobbies')
      .update({ players: updatedPlayers })
      .eq('code', code)
      .select('players')
      .single();

    if (updateError) {
      console.error('Update error', updateError);
      return NextResponse.json({ error: 'Failed to remove bot' }, { status: 500 });
    }

    return NextResponse.json({ players: updated.players });
  } catch (err) {
    console.error('Remove bot error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
