import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const componentRoot = resolve(process.cwd(), "apps/web/src/components");
const source = readFileSync(resolve(componentRoot, "shipping-approved-live-layout-v3.tsx"), "utf8");
const styles = readFileSync(
  resolve(componentRoot, "shipping-approved-live-layout.module.css"),
  "utf8",
);
const approvedMobileSource = readFileSync(
  resolve(componentRoot, "approved-mobile/approved-mobile-demo.tsx"),
  "utf8",
);
const pcPackSource = source.slice(
  source.indexOf("function PcPack"),
  source.indexOf("function PcShippingSafetyDialog"),
);
const pcSafetyDialogSource = source.slice(
  source.indexOf("function PcShippingSafetyDialog"),
  source.indexOf("function PcShip("),
);
const mobileMessagesSource = source.slice(
  source.indexOf("function MobileMessages"),
  source.indexOf("function MobileApprovedContent"),
);
const pcShipSource = source.slice(source.indexOf("function PcShip("));

describe("ShippingApprovedLiveLayout v3", () => {
  it("uses the frozen approved mobile and PC shells rather than a parallel design", () => {
    expect(source).toContain("approved-mobile/approved-mobile-demo.module.css");
    expect(source).toContain("approved-pc/approved-pc-middle-screens.module.css");
    expect(source).toContain("<PcCanvas");
    expect(source).toContain("mobileStyles.phoneShell");
    expect(source).toContain("mobileStyles.statusBar");
    expect(source).toContain("mobileStyles.footer");
    expect(source).toContain("pcStyles.utilityHeader");
    expect(source).toContain("pcStyles.utilityPageHeading");
    expect(source).toContain('data-approved-live-shipping="v3"');
  });

  it("keeps approved Mobile 34-38 and PC 29-32 content in the correct sequence", () => {
    for (const copy of [
      "必要な情報を入力してください",
      "手順にそって取り出してください",
      "で使える方法を選んでください",
      "公式料金を確認",
      "内容を確認してください",
      "内容を記録してください",
      "注文を記録",
      "商品を取り出す",
      "発送前の写真",
      "配送方法と発送",
    ]) {
      expect(source).toContain(copy);
    }
    expect(source).toContain('if (stage === "photo_and_pack") return "35"');
    expect(source).toContain('data-additional-live-screen="shipping-safety-step"');
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain("method.pcFeeLabel ?? method.feeLabel");
    expect(source).toContain("props.pcShippingFee ?? props.shippingFee");
    expect(source).toContain("props.photoStatusLabel");
    expect(source).toContain("<ShippingMethodRow");
    expect(source).toContain("mobileStyles.officialCheckIcon");
    expect(source).toContain('placeholder="例）TX-260826-012"');
    expect(source).toContain('placeholder="例）たろう"');
  });

  it("keeps routine success feedback accessible without changing the approved composition", () => {
    expect(mobileMessagesSource).toContain("liveStyles.srOnly");
    expect(mobileMessagesSource).toContain('role="status"');
    expect(mobileMessagesSource).not.toContain("liveStyles.notice");
  });

  it("keeps the static review route synchronized with the approved shipping board copy", () => {
    expect(approvedMobileSource).toContain("<ShippingMethodRow");
    expect(approvedMobileSource).toContain("styles.officialCheckIcon");
    expect(approvedMobileSource).toContain(
      "<p className={styles.boardInstruction}>内容を確認してください</p>",
    );
    expect(approvedMobileSource).toContain(
      "<p className={styles.boardInstruction}>内容を記録してください</p>",
    );
    expect(approvedMobileSource).toContain("⚠ 料金は変わることがあります");
    expect(approvedMobileSource).not.toContain("発送内容を確認してください");
  });

  it("never presents review-fixture photos as live order evidence", () => {
    expect(source).not.toContain("mobile-pickup-shelf-approved.png");
    expect(source).not.toContain("shelf-order-photo.png");
    expect(source).not.toContain("headphones.png");
    expect(source).not.toContain("packing-box.png");
    expect(source).toContain("保管場所の写真は未設定");
    expect(source).toContain("は未撮影");
    expect(styles).toContain(".photoPlaceholder");
    expect(styles).toContain(".pcPhotoPlaceholder");
  });

  it("labels each live location photo with the server-bound location code", () => {
    expect(source).toContain("<span>{valueOrMissing(props.locationCode)}</span>");
  });

  it("keeps all external communication outside the presentation component", () => {
    expect(source).not.toMatch(/fetch\s*\(/u);
    expect(source).not.toMatch(/https?:\/\//u);
    expect(styles).not.toMatch(/url\s*\(/u);
  });

  it("preserves human confirmation controls and accessible interaction guards", () => {
    for (const contract of [
      "photoConfirmationControl",
      "packingConfirmationControl",
      "policySaveControl",
      "addressControl",
      "reviewConfirmedAt",
      "onCheckOfficialFee",
      "onShippingMethodChange",
    ]) {
      expect(source).toContain(contract);
    }
    expect(styles).toContain(":focus-visible");
    expect(styles).toContain("min-height: 44px");
  });

  it("keeps PC31 as the compact approved board and moves changing safety work into a dialog", () => {
    expect(pcPackSource).toContain("pcStyles.packOpts");
    expect(pcPackSource).toContain("pcStyles.packBottom");
    expect(pcPackSource).toContain("pcStyles.privacyNote");
    expect(pcPackSource).toContain("pcSafetyLink");
    expect(pcPackSource).toContain("pcPhotoAction");
    expect(pcPackSource).toContain("onOpenSafety");
    expect(pcPackSource).not.toContain("policySaveControl");
    expect(pcPackSource).not.toContain("photoDecisionControl");
    expect(pcPackSource).not.toContain("controlRow");
    expect(pcSafetyDialogSource).toContain('data-additional-live-screen="shipping-photo-safety"');
    expect(pcSafetyDialogSource).toContain("policySaveControl");
    expect(pcSafetyDialogSource).toContain("photoDecisionControl");
    expect(pcSafetyDialogSource).toContain("productPhotoControl");
    expect(pcSafetyDialogSource).toContain("packingConfirmationControl");
  });

  it("makes the PC31 safety dialog modal, inert in the background, and keyboard-dismissible", () => {
    expect(source).toContain("pcSafetyRequired");
    expect(source).toContain("inert={props.catalogDialogOpen || pcSafetyRequired || undefined}");
    expect(pcSafetyDialogSource).toContain('role="dialog"');
    expect(pcSafetyDialogSource).toContain('aria-modal="true"');
    expect(pcSafetyDialogSource).toContain('event.key === "Escape"');
    expect(source).toContain("previouslyFocused?.focus()");
    expect(source).toContain("pcSafetyReturnFocusRef");
    expect(source).toContain("if (returnFocus?.isConnected) returnFocus.focus()");
    expect(source).toContain("catalogReturnFocusRef");
    expect(source).toContain("onEditShippingCatalog: openShippingCatalog");
    expect(source).toContain("if (event.shiftKey && document.activeElement === first)");
  });

  it("keeps the selected PC shipping method visible in the approved three-row frame", () => {
    expect(pcShipSource).toContain("const visibleMethods = selectedMethod");
    expect(pcShipSource).toContain(".slice(0, 3)");
    expect(pcShipSource).toContain("visibleMethods.map");
  });
});
