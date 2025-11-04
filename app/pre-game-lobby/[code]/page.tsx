// This file is a server component that reads the router `params` synchronously
// and passes a plain string prop down to a client-only component. That avoids
// the hydration/runtime warning about `params` being a Promise when used in
// a client component.

import PregameClient from './PregameClient';

type Props = {
  // In new Next.js versions `params` can 
  // be a Promise. Accept either a
  // plain params object or a Promise that resolves to it.
  params: Promise<{ code?: string }> | { code?: string };
};

export default async function LobbyPage({ params }: Props) {
  const resolved = await params;
  const code = String(resolved?.code || "").toUpperCase();

  return <PregameClient code={code} />;
}