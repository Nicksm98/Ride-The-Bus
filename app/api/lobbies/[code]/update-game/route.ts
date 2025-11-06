import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await context.params;
    const codeUpper = code.toUpperCase();
    const body = await req.json();
    
    const { gameState, deck } = body;

    if (!gameState) {
      return NextResponse.json(
        { error: "gameState is required" },
        { status: 400 }
      );
    }

    // Update lobby with new game state
    const { error: updateError } = await supabase
      .from("lobbies")
      .update({
        game_state: gameState,
        deck: deck || null
      })
      .eq("code", codeUpper);

    if (updateError) {
      console.error('Failed to update game state:', updateError);
      return NextResponse.json(
        { error: `Failed to update game: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error in update-game API:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
