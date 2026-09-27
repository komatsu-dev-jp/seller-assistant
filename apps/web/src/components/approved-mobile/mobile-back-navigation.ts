const screenPathMarker = "/mobile/screens/";

/** Only return through browser history when the preceding page belongs to this review. */
export function canReturnToMobileReviewPage(
  referrer: string,
  currentHref: string,
  screenIds: readonly string[],
): boolean {
  if (!referrer) return false;

  try {
    const current = new URL(currentHref);
    const previous = new URL(referrer);
    if (previous.origin !== current.origin) return false;

    const markerIndex = current.pathname.lastIndexOf(screenPathMarker);
    if (markerIndex < 0) return false;
    const reviewRoot = current.pathname.slice(0, markerIndex + screenPathMarker.length);
    const currentPath = current.pathname.replace(/\/$/u, "");
    const previousPath = previous.pathname.replace(/\/$/u, "");
    if (previousPath === currentPath) return false;

    const mobileRoot = reviewRoot.slice(0, -"screens/".length).replace(/\/$/u, "");
    if (previousPath === mobileRoot || previousPath === `${mobileRoot}/app`) return true;
    if (!previous.pathname.startsWith(reviewRoot)) return false;

    const previousId = previous.pathname.slice(reviewRoot.length).replace(/\/$/u, "");
    if (previousId && !screenIds.includes(previousId)) return false;

    return true;
  } catch {
    return false;
  }
}
