import type { ListingPrepPilotFixtureProfile } from "@resale/contracts";

type PilotCategory = ListingPrepPilotFixtureProfile["category"];

const displayCategoryByCode = {
  tops: "トップス",
  outer: "アウター",
  pants: "パンツ",
  knit: "ニット",
} as const satisfies Record<PilotCategory, string>;

export function pilotDisplayCategory(category: PilotCategory): string {
  return displayCategoryByCode[category];
}
