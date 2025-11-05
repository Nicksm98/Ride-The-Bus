// This file is a server component that reads the router `params` synchronously
// and passes a plain string prop down to a client-only component. That avoids
// the hydration/runtime warning about `params` being a Promise when used in
// a client component.

import PregameClient from './PregameClient';

type Props = {
  params: Promise<{ code: string }>;
};

export default async function LobbyPage({ params }: Props) {
  const { code } = await params;

  return <PregameClient code={code.toUpperCase()} />;
}