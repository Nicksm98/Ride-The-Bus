import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';

const BOT_NAMES = [
  'Bot Alice', 'Bot Bob', 'Bot Charlie', 'Bot Diana',
  'Bot Eddie', 'Bot Fiona', 'Bot George', 'Bot Hannah',
  'Bot Ivan', 'Bot Julia', 'Bot Kevin', 'Bot Laura'
];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const codeUpper = code.toUpperCase();

    const supabase = getSupabaseAdmin();

    // Get current lobby
    const { data: lobby, error: fetchError } = await supabase
      .from('lobbies')
      .select('players')
      .eq('code', codeUpper)
      .single();

    if (fetchError || !lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
    }

    const currentPlayers = lobby.players || [];
    
    // Find an unused bot name
    const usedNames = new Set(currentPlayers.map((p: { name: string }) => p.name));
    const availableName = BOT_NAMES.find(name => !usedNames.has(name)) || `Bot ${Math.floor(Math.random() * 1000)}`;

    // Generate bot ID
    const botId = `bot-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // Add bot to players array
    const newPlayer = {
      id: botId,
      name: availableName
    };

    const updatedPlayers = [...currentPlayers, newPlayer];

    // Update the lobby directly
    const { error: updateError } = await supabase
      .from('lobbies')
      .update({ players: updatedPlayers })
      .eq('code', codeUpper);

    if (updateError) {
      console.error('Failed to update lobby:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      id: botId,
      name: availableName,
      players: updatedPlayers
    });
  } catch (err) {
    console.error('Error adding bot:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}