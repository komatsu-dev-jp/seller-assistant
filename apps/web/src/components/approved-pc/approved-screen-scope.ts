const p1PcScreenNumbers = new Set([
  6, 7, 8, 18, 19, 25, 26, 27, 28, 41, 42, 43, 44, 49, 50, 51, 52,
]);

export function isP1ApprovedPcScreen(screenNumber: number): boolean {
  return Number.isInteger(screenNumber) && p1PcScreenNumbers.has(screenNumber);
}

export function getApprovedPcLiveRoute(screenNumber: number): string | null {
  if (!Number.isInteger(screenNumber) || screenNumber < 1 || screenNumber > 52) return null;
  if (isP1ApprovedPcScreen(screenNumber)) return null;
  if (screenNumber === 1) return "/login";
  if (screenNumber === 2) return "/";
  if (screenNumber <= 4) return "/team";
  if (screenNumber === 5) return "/workflow";
  if (screenNumber <= 9) return "/inventory";
  if (screenNumber === 10) return "/inventory/labels";
  if (screenNumber <= 12) return "/inventory";
  if (screenNumber <= 24) return "/workflow";
  if (screenNumber <= 32) return "/shipping";
  if (screenNumber === 33) return "/inventory";
  if (screenNumber <= 36) return "/inventory/stocktake";
  if (screenNumber <= 40) return "/team";
  return "/accounting";
}
