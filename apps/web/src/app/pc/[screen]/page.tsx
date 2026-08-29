import { notFound } from "next/navigation";

import { ApprovedPcDemo } from "../../../components/approved-pc/approved-pc-demo";

export const dynamic = "force-dynamic";

export default async function ApprovedPcScreenPage({
  params,
}: {
  params: Promise<{ screen: string }>;
}) {
  const { screen } = await params;
  if (!/^(?:[1-9]|[1-4][0-9]|5[0-2])$/u.test(screen)) notFound();
  return <ApprovedPcDemo screenNumber={Number(screen)} />;
}
