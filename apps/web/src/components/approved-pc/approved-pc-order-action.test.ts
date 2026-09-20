import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const componentRoot = resolve(process.cwd(), "apps/web/src/components");
const source = readFileSync(
  resolve(componentRoot, "approved-pc/approved-pc-middle-screens.tsx"),
  "utf8",
);
const orderSource = source.slice(
  source.indexOf("function Order()"),
  source.indexOf("function Pick()"),
);
const pickSource = source.slice(
  source.indexOf("function Pick()"),
  source.indexOf("function Pack()"),
);

describe("approved PC order and pick preview boundaries", () => {
  it("opens the address explanation without a self-link and keeps local fields controlled", () => {
    expect(orderSource).toContain("setDetailsOpen((current) => !current)");
    expect(orderSource).toContain("aria-expanded={detailsOpen}");
    expect(orderSource).not.toContain("<a href={to(29)}>詳しく見る");
    expect(orderSource).toContain("value={transactionId}");
    expect(orderSource).toContain("value={salesAmount}");
    expect(orderSource).toContain("value={buyerName}");
    expect(orderSource).toContain("value={channel}");
  });

  it("updates the approved two-item missing summary and gives the defer buttons local meaning", () => {
    expect(orderSource).toContain(
      "const missingCount = Number(!transactionId.trim()) + Number(!salesAmount.trim())",
    );
    expect(orderSource).toContain('setTransactionId("")');
    expect(orderSource).toContain('setSalesAmount("")');
    expect(orderSource).toContain("未入力 ${missingCount}件");
    expect(orderSource).toContain("この見本画面から注文は保存されません");
  });

  it("separates preview navigation from an unavailable real registration", () => {
    expect(orderSource).toContain("取り出し画面の見本を見る");
    expect(orderSource).toContain("仮登録は準備中");
    expect(orderSource).toContain("実注文は登録されません");
    expect(orderSource).toMatch(/disabled\s*>\s*仮登録は準備中/u);
    expect(orderSource).not.toContain("<Button n={29}>");
    expect(orderSource).not.toMatch(/fetch\(|requestJson\(|XMLHttpRequest/u);
  });

  it("does not present the PC30 example as a real scan or completed pick", () => {
    expect(pickSource).toContain("一致状態の表示見本");
    expect(pickSource).toContain("実際のラベル読み取り・照合結果ではありません");
    expect(pickSource).toContain("発送前写真の見本を見る");
    expect(pickSource).toContain("取り出し完了は準備中");
    expect(pickSource).toMatch(/disabled\s*>\s*取り出し完了は準備中/u);
    expect(pickSource).not.toContain("● 一致しました");
    expect(pickSource).not.toContain("<Button n={30}>");
  });
});
