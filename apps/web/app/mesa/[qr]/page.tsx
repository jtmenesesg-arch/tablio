import { DinerPwa } from "./diner-pwa";

export default async function DinerPage({
  params,
}: {
  params: Promise<{ qr: string }>;
}) {
  const { qr } = await params;
  return <DinerPwa qrToken={qr} />;
}
