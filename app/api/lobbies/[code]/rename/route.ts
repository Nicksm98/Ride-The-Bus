import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: Request, { params }: { params: { code: string } }) {
  try {
    const code = String(params.code || '').toUpperCase();
    const body = await req.json();
    const playerId = String(body.playerId || '');
    const name = String(body.name || '').trim();

    if (!playerId || !name) {
      return NextResponse.json({ error: 'playerId and name are required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.rpc('update_player_name', {
      p_code: code,
      p_player_id: playerId,
      p_name: name,
    });

    if (error) {
      console.error('RPC update_player_name error', error);
      return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
    }

    return NextResponse.json({ players: data?.[0]?.players ?? data ?? null });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
