import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const componentRoot = resolve(process.cwd(), "apps/web/src/components");
const source = readFileSync(
  resolve(componentRoot, "approved-pc/approved-pc-late-screens.tsx"),
  "utf8",
);
const inventorySource = source.slice(
  source.indexOf("function Inventory()"),
  source.indexOf("function Stocktake()"),
);
const stocktakeSource = source.slice(
  source.indexOf("function Stocktake()"),
  source.indexOf("function Mismatch()"),
);
const mismatchSource = source.slice(
  source.indexOf("function Mismatch()"),
  source.indexOf("function Status()"),
);
const statusSource = source.slice(
  source.indexOf("function Status()"),
  source.indexOf("function Members()"),
);

describe("approved PC inventory preview boundaries", () => {
  it("labels PC33 as fictional data and separates preview navigation from storage actions", () => {
    expect(inventorySource).toContain("架空データのため実在庫・履歴は更新しません");
    expect(inventorySource).toContain("棚卸し画面の見本を見る");
    expect(inventorySource).toContain("保管場所を開く（準備中）");
    expect(inventorySource).toContain("履歴表示は準備中");
    expect(inventorySource).not.toContain("<Btn n={33}>");
    expect(inventorySource).not.toContain("href={go(40)}");
  });

  it("does not claim an offline save or start a stocktake from PC34", () => {
    expect(stocktakeSource).toContain("オフライン時の表示例です");
    expect(stocktakeSource).toContain("読み取りを保存・同期しません");
    expect(stocktakeSource).toContain("数が合わない商品の見本を見る");
    expect(stocktakeSource).toContain("棚卸し開始は準備中");
    expect(stocktakeSource).toMatch(/disabled\s*>\s*棚卸し開始は準備中/u);
    expect(stocktakeSource).not.toContain("読み取りは保存され、オンライン時に同期されます");
    expect(stocktakeSource).not.toContain("<Btn n={34}");
  });

  it("keeps PC35 fields local and disables unsupported reread, photo, and confirmation", () => {
    expect(mismatchSource).toContain("備考はこの見本画面だけで、保存されません");
    expect(mismatchSource).toContain("再読取は準備中");
    expect(mismatchSource).toContain("写真追加は準備中");
    expect(mismatchSource).toContain("確認保存は準備中");
    expect(mismatchSource).toContain("状態変更の見本を見る");
    expect(mismatchSource).toMatch(/<select disabled>/u);
    expect(mismatchSource).not.toContain("href={go(35)}");
    expect(mismatchSource).not.toContain("<Btn n={35}>");
  });

  it("does not change, restore, quarantine, or save inventory from PC36", () => {
    expect(statusSource).toContain("実在庫・履歴は更新せず");
    expect(statusSource).toContain("この見本画面では操作しません");
    expect(statusSource).toContain("仮状態への変更は準備中");
    expect(statusSource).toContain("在庫への復元は準備中");
    expect(statusSource).toContain("返品保留への変更は準備中");
    expect(statusSource).toContain("確認結果の保存は準備中");
    expect(statusSource).toContain("未実行（見本画面）");
    expect(statusSource).not.toContain("href={go(36)}");
    expect(statusSource).not.toContain("href={go(37)}");
    expect(statusSource).not.toContain("長押し中：0秒");
    expect(statusSource).not.toMatch(/fetch\(|requestJson\(|XMLHttpRequest/u);
  });
});
