import { listingPrepPilotFixtureProfiles } from "@resale/contracts";
import { describe, expect, it } from "vitest";

import { pilotDisplayCategory } from "./pilot-category";

describe("pilot purchase category", () => {
  it("uses the server display category for all ten fixed fixtures", () => {
    expect(
      listingPrepPilotFixtureProfiles.map((profile) => [
        profile.fixtureId,
        pilotDisplayCategory(profile.category),
      ]),
    ).toEqual([
      ["TOP-01", "トップス"],
      ["TOP-02", "トップス"],
      ["TOP-03", "トップス"],
      ["TOP-04", "トップス"],
      ["OUTER-01", "アウター"],
      ["OUTER-02", "アウター"],
      ["PANTS-01", "パンツ"],
      ["PANTS-02", "パンツ"],
      ["KNIT-01", "ニット"],
      ["KNIT-02", "ニット"],
    ]);
  });
});
