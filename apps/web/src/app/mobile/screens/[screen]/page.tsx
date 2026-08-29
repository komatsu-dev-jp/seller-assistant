import { notFound } from "next/navigation";

import { ApprovedMobileDemo } from "../../../../components/approved-mobile/approved-mobile-demo";
import {
  getMobileScreen,
  mobileScreenIds,
} from "../../../../components/approved-mobile/mobile-screen-data";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return mobileScreenIds.map((screen) => ({ screen }));
}

export default async function ApprovedMobileScreenPage({
  params,
}: {
  params: Promise<{ screen: string }>;
}) {
  const { screen } = await params;
  if (!getMobileScreen(screen)) notFound();
  return <ApprovedMobileDemo screenId={screen} />;
}
