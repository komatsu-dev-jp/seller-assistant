import { ApprovedMobileDemo } from "../../../../web/src/components/approved-mobile/approved-mobile-demo";

/**
 * Stable mobile entry that did not exist in the legacy offline cache.
 *
 * Older service workers cached `/mobile/screens/04/` before checking the
 * network. Opening this route once therefore reaches the current deployment,
 * installs the network-first worker, and then lets the normal screen routes
 * continue to work without clearing the user's browser-only review data.
 */
export default function MobileAppEntryPage() {
  return <ApprovedMobileDemo screenId="04" />;
}
