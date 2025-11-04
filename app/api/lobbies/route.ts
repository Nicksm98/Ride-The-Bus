import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { generateCode } from '@/lib/utils/generateCode';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const hostName = body?.hostName ?? 'Host';

    // create supabase client inside handler so missing env vars are handled here
    let supabase;
    try {
      supabase = getSupabaseAdmin();
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }

    let code: string | undefined;
    let tries = 0;
    while (tries < 5) {
      code = generateCode(6);
      const hostId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const players = [{ id: hostId, name: hostName }];
      const { error } = await supabase.from('lobbies').insert([
        {
          code,
          host_name: hostName,
          players: players,
        },
      ]);


      if (!error) {
        const url = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/join/${code}`;
        return NextResponse.json({ code, url, id: hostId });
      }

      // if error indicates unique violation, retry; otherwise return error
      // Supabase error object may not expose code consistently; just retry up to tries
      tries++;
    }

    return NextResponse.json({ error: 'Could not generate unique code' }, { status: 500 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
