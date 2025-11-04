import GameLobbyClient from './GameLobbyClient';

export default async function GameLobbyPage({ 
  params 
}: { 
  params: Promise<{ code: string }> 
}) {
  const { code } = await params;
  return <GameLobbyClient code={code} />;
}