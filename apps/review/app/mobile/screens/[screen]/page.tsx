import { notFound } from "next/navigation";

import { ApprovedMobileDemo } from "../../../../../web/src/components/approved-mobile/approved-mobile-demo";
import {
  getMobileScreen,
  mobileScreenIds,
} from "../../../../../web/src/components/approved-mobile/mobile-screen-data";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return mobileScreenIds.map((screen) => ({ screen }));
}

export default async function MobileScreenPage({
  params,
}: {
  params: Promise<{ screen: string }>;
}) {
  const { screen } = await params;
  if (!getMobileScreen(screen)) notFound();
  return <ApprovedMobileDemo screenId={screen} />;
}
