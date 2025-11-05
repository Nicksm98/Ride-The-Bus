import JoinClient from './JoinClient';

type Props = {
  params: Promise<{ code: string }>;
};

export default async function JoinPage({ params }: Props) {
  const { code } = await params;
  return <JoinClient code={code} />;
}
