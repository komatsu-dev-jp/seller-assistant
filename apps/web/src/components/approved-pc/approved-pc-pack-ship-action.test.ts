import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const componentRoot = resolve(process.cwd(), "apps/web/src/components");
const source = readFileSync(
  resolve(componentRoot, "approved-pc/approved-pc-middle-screens.tsx"),
  "utf8",
);
const packSource = source.slice(
  source.indexOf("function Pack()"),
  source.indexOf("function Ship()"),
);
const shipSource = source.slice(
  source.indexOf("function Ship()"),
  source.indexOf("export function ApprovedPcMiddleScreens"),
);

describe("approved PC pack and ship preview boundaries", () => {
  it("keeps pack policy feedback consistent and starts human checks unchecked", () => {
    expect(packSource).toContain("ariaPressed={i === policy}");
    expect(packSource).toContain('i === policy ? "◉" : "○"');
    expect(packSource).toContain("checklistItems.map(() => false)");
    expect(packSource).toContain("checked={checkedItems[i]}");
    expect(packSource).not.toContain("defaultChecked");
  });

  it("does not claim to reshoot or save photos in the static preview", () => {
    expect(packSource).toContain("再撮影は準備中");
    expect(packSource).toContain("写真の保存は準備中");
    expect(packSource).toContain("この見本画面では写真を保存・外部送信しません");
    expect(packSource).toMatch(/disabled\s*>\s*▣ 再撮影は準備中/u);
    expect(packSource).toMatch(/disabled\s*>\s*写真の保存は準備中/u);
    expect(packSource).not.toContain("<a href={to(31)}>▣ 再撮影</a>");
    expect(packSource).not.toContain("<Button n={31}>");
    expect(packSource).not.toMatch(/fetch\(|requestJson\(|XMLHttpRequest/u);
  });

  it("separates shipping-preview navigation from a real shipment record", () => {
    expect(shipSource).toContain("実写真の確認結果ではありません");
    expect(shipSource).not.toContain("¥450（確定）");
    expect(shipSource).not.toContain("● 発送前の写真　2枚・確認済み");
    expect(shipSource).not.toContain("<Button n={32}>");
    expect(shipSource).toContain("在庫画面の見本を見る");
    expect(shipSource).toMatch(/disabled\s*>\s*発送記録は準備中/u);
    expect(shipSource).not.toMatch(/fetch\(|requestJson\(|XMLHttpRequest/u);
  });

  it("makes local shipping choices agree with their marker and candidate fee", () => {
    expect(shipSource).toContain("aria-pressed={i === selectedMethod}");
    expect(shipSource).toContain('i === selectedMethod ? "◉" : "○"');
    expect(shipSource).toContain("shippingMethods[selectedMethod]?.[2]");
    expect(shipSource).toContain("入力内容はこの見本画面だけで、保存されません");
    expect(shipSource).not.toContain("href={to(32)} key={method}");
    expect(shipSource).not.toContain("className={styles.catalogEdit} href={to(32)}");
  });
});
