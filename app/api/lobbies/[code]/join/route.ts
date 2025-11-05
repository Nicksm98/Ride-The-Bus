import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = rawCode?.toUpperCase();
  try {
    const body = await req.json();
    const name = (body?.name as string) || 'Anon';

    const supabase = getSupabaseAdmin();

    // Use a DB-side RPC to atomically append the player and return the new id + players
    const { data, error } = await supabase.rpc('add_player_to_lobby', { p_code: code, p_name: name });

    if (error) {
      // If the function raised 'Lobby not found' it will surface as an error message
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // rpc returns an array of rows for some setups; normalize
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return NextResponse.json({ error: 'Unexpected RPC result' }, { status: 500 });

    // row contains player_id and players (jsonb)
    return NextResponse.json({ id: row.player_id || row.player_id, players: row.players || row.players });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
