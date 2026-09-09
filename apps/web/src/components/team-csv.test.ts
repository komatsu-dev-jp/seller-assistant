import { describe, expect, it } from "vitest";

import { csvCell } from "./team-change-csv";

describe("team change history CSV", () => {
  it.each(["=1+1", "+SUM(A1:A2)", "-2+3", "@SUM(A1:A2)", "\t=cmd", "\r\n+cmd"])(
    "forces formula-shaped value %j to plain text",
    (value) => {
      expect(csvCell(value)).toBe(`"'${value.replaceAll('"', '""')}"`);
    },
  );

  it("keeps ordinary text readable and escapes embedded quotes", () => {
    expect(csvCell("担当変更")).toBe('"担当変更"');
    expect(csvCell('表示名 "A"')).toBe('"表示名 ""A"""');
    expect(csvCell("")).toBe('""');
    expect(csvCell("  ")).toBe('"  "');
  });
});
