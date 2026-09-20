import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const componentRoot = resolve(process.cwd(), "apps/web/src/components");
const source = readFileSync(
  resolve(componentRoot, "approved-pc/approved-pc-late-screens.tsx"),
  "utf8",
);
const forecastSource = source.slice(
  source.indexOf("function Forecast()"),
  source.indexOf("function Actual()"),
);
const actualSource = source.slice(
  source.indexOf("function Actual()"),
  source.indexOf("function Kpi()"),
);
const kpiSource = source.slice(
  source.indexOf("function Kpi()"),
  source.indexOf("function Suppliers()"),
);
const supplierSource = source.slice(
  source.indexOf("function Suppliers()"),
  source.indexOf("function Facts()"),
);

describe("approved PC analytics preview boundaries", () => {
  it("labels PC41 estimates as fictional while keeping the approved example values", () => {
    expect(forecastSource).toContain("準備中・架空データの見込み例・人が確認");
    expect(forecastSource).toContain("販売後の実績の見本を見る");
    expect(forecastSource).toContain('["実数", "48着"');
    expect(forecastSource).toContain("⚖　損益分岐　<b>24着</b>");
    expect(forecastSource).not.toContain("<Btn n={41}");
  });

  it("does not describe PC42 fictional values as a completed close", () => {
    expect(actualSource).toContain("準備中・架空データの実績例・人が確認");
    expect(actualSource).toContain("この数値は実際の締め集計ではありません");
    expect(actualSource).toContain("月別KPIの見本を見る");
    expect(actualSource).not.toContain("数値は締め時点の集計です");
    expect(actualSource).not.toContain("<Btn n={42}");
  });

  it("disables unsupported month changes and separates the PC44 preview link", () => {
    expect(kpiSource).toContain("準備中・架空データの表示見本（実集計ではありません）");
    expect(kpiSource).toContain("対象月の切替は準備中");
    expect(kpiSource).toContain("仕入先比較の見本を見る");
    expect(kpiSource).toContain("対象月の表示例　2025年5月");
    expect(kpiSource).not.toContain("‹　2025年5月　›");
    expect(kpiSource).not.toContain("<Btn n={43}");
  });

  it("does not call the PC44 fictional supplier table operational data", () => {
    expect(supplierSource).toContain("準備中・架空データの比較例");
    expect(supplierSource).toContain("不足データ確認は準備中");
    expect(supplierSource).toContain("売上の事実画面の見本を見る");
    expect(supplierSource).toContain("実運用データの集計ではありません");
    expect(supplierSource).not.toContain("数値は運用データの集計です");
    expect(supplierSource).not.toContain("<Btn n={44}");
    expect(supplierSource).not.toMatch(/fetch\(|requestJson\(|XMLHttpRequest/u);
  });
});
