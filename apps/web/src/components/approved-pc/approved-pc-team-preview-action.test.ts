import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const componentRoot = resolve(process.cwd(), "apps/web/src/components");
const source = readFileSync(
  resolve(componentRoot, "approved-pc/approved-pc-late-screens.tsx"),
  "utf8",
);
const memberSource = source.slice(
  source.indexOf("function Members()"),
  source.indexOf("function Assignment()"),
);
const assignmentSource = source.slice(
  source.indexOf("function Assignment()"),
  source.indexOf("function Approval()"),
);
const approvalSource = source.slice(
  source.indexOf("function Approval()"),
  source.indexOf("function History()"),
);
const historySource = source.slice(
  source.indexOf("function History()"),
  source.indexOf("function Metric("),
);

describe("approved PC team preview boundaries", () => {
  it("does not invite, resend, stop, or open the wrong member screen from PC37", () => {
    expect(memberSource).toContain("架空メンバーの招待・停止・権限は変更しません");
    expect(memberSource).toContain("メンバー招待は準備中");
    expect(memberSource).toContain("再送信（準備中）");
    expect(memberSource).toContain("停止（準備中）");
    expect(memberSource).toContain("担当割当画面の見本を見る");
    expect(memberSource).not.toContain("<Btn n={37}");
    expect(memberSource).not.toContain("href={go(37)}");
  });

  it("keeps PC38 permission details internally consistent and disables assignment", () => {
    expect(assignmentSource).toContain("担当・期間・閲覧権限は保存しません");
    expect(assignmentSource).toContain('name="assignment-scope-preview"');
    expect(assignmentSource).toContain("基本情報のみの表示例");
    expect(assignmentSource).toContain("担当割当の保存は準備中");
    expect(assignmentSource).toContain("変更確認画面の見本を見る");
    expect(assignmentSource).not.toContain("<Btn n={38}");
    expect(assignmentSource).not.toMatch(/fetch\(|requestJson\(|XMLHttpRequest/u);
  });

  it("does not comment, reject, or approve the fictional PC39 change", () => {
    expect(approvalSource).toContain("架空の申請で、承認・差し戻し・送信は行いません");
    expect(approvalSource).toContain("コメントは準備中");
    expect(approvalSource).toContain("差し戻しは準備中");
    expect(approvalSource).toContain("承認は準備中");
    expect(approvalSource).toContain("実際の4方向の証拠写真ではありません");
    expect(approvalSource).toContain("変更履歴の見本を見る");
    expect(approvalSource).not.toContain("<Btn n={39}");
    expect(approvalSource).not.toContain("href={go(39)}");
  });

  it("does not fake filtering, pagination, or export from PC40", () => {
    expect(historySource).toContain("履歴の検索・出力・変更を行いません");
    expect(historySource).toContain("履歴の書き出しは準備中");
    expect(historySource).toContain("検索は準備中");
    expect(historySource).toContain('CHG-2505-00078" ?');
    expect(historySource).toContain("（対応見本）");
    expect(historySource).toContain("次のページはありません");
    expect(historySource).not.toContain("setPage(");
    expect(historySource).not.toContain("<Btn n={40}");
  });
});
