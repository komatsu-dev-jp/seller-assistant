import { describe, expect, it } from "vitest";

import { optionalFormText } from "./form-data-fields";

describe("optionalFormText", () => {
  it("allows an absent optional field for ordinary non-pilot work", () => {
    expect(optionalFormText(new FormData(), "pilotRunId")).toBeNull();
  });

  it("trims a present optional field", () => {
    const form = new FormData();
    form.set("pilotRunId", "  run-id  ");
    expect(optionalFormText(form, "pilotRunId")).toBe("run-id");
  });
});
