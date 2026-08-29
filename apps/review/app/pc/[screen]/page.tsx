import { notFound } from "next/navigation";

import { ApprovedPcDemo } from "../../../../web/src/components/approved-pc/approved-pc-demo";

const pcScreenIds = Array.from({ length: 52 }, (_, index) => String(index + 1));

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return pcScreenIds.map((screen) => ({ screen }));
}

export default async function PcScreenPage({ params }: { params: Promise<{ screen: string }> }) {
  const { screen } = await params;
  if (!pcScreenIds.includes(screen)) notFound();
  return <ApprovedPcDemo screenNumber={Number(screen)} />;
}
