"use client";

import { useEffect, useState, type ReactNode } from "react";
import { isStaticApprovedReview } from "../approved-review-environment";
import { BoxIntakeFlow, IntakeProductList } from "../approved-mobile/box-intake-flow";
import { LocalReviewFlow } from "../approved-mobile/local-review-flow";
import { getMobileScreen } from "../approved-mobile/mobile-screen-data";
import { PreparationProductCard, ProductPreparation } from "../approved-mobile/product-preparation";
import { ReportedReviewFlow } from "../approved-mobile/reported-review-flow";
import { ReviewRecipePicker } from "../approved-mobile/review-recipe-picker";
import { reviewPath } from "../approved-mobile/review-path";
import {
  accountingHref,
  isPcLocalWorkScreen,
  pcAccountingScreen,
  workflowHref,
} from "../approved-mobile/review-workflow-routes";
import { PcUiGlyph, type PcUiGlyphName } from "./pc-ui-glyph";
import ui from "./pc-browser-workflow.module.css";
import { SellerWorkspace } from "../seller-workspace/seller-workspace";
import { sellerHref } from "../seller-workspace/navigation";

type Kind = "products" | "preparation" | "recipes" | "workflow";
const basePath = process.env.NEXT_PUBLIC_REVIEW_BASE_PATH ?? "";
const pcPath = (number: number) => reviewPath(`/pc/${number}/`, basePath);
export const pcBrowserWorkflowScreens = [2, 3, 6, 7, 8, 46, 47, 48] as const;

const navigation: readonly [string, PcUiGlyphName, string][] = [
  ["ホーム", "home", pcPath(2)],
  ["商品", "product", workflowHref("pc", "products")],
  ["発送", "orders", sellerHref("pc", "shipping")],
  ["レポート", "accounting", sellerHref("pc", "reports")],
  ["設定", "settings", sellerHref("pc", "settings")],
];

function Workspace({
  title,
  active,
  children,
}: {
  title: string;
  active: string;
  children: ReactNode;
}) {
  return (
    <main className={ui.workspace} data-implementation-scope="pc-browser-workflow">
      <aside className={ui.sidebar}>
        <a className={ui.brand} href={pcPath(2)}>
          <PcUiGlyph name="purchase" />
          Seller Assistant
        </a>
        <nav aria-label="PCのメニュー">
          {navigation.map(([label, icon, href]) => (
            <a key={label} href={href} aria-current={active === label ? "page" : undefined}>
              <PcUiGlyph name={icon} />
              {label}
            </a>
          ))}
        </nav>
        <a className={ui.switchView} href={reviewPath("/mobile/screens/04/", basePath)}>
          スマホ用の表示へ ›
        </a>
      </aside>
      <div className={ui.main}>
        <header className={ui.header}>
          <div>
            <small>作業スペース・操作確認版</small>
            <h1>{title}</h1>
          </div>
        </header>
        <div className={ui.content}>
          <details className={ui.boundary}>
            <summary>保存先と、まだできないこと</summary>
            <p>
              箱・商品・写真はこのブラウザー内に保存します。会計の確認用入力はこのタブ内の一時記録です。別のスマホ・PCとはまだ共有しません。外部への自動送信・出品・課金サービスの追加はありません。
            </p>
            <p>
              出品準備の見本REVIEW-0001は、箱から登録した商品とは別です。実商品・個人情報はまだ入力しないでください。
            </p>
          </details>
          {children}
        </div>
      </div>
    </main>
  );
}

function StartWork() {
  const actions = [
    [
      "届いた箱を検品する",
      "点数を数える → 商品を登録 → 販売事例と見込み利益",
      workflowHref("pc", "intake"),
    ],
    [
      "商品一覧を見る",
      "登録した箱から、検品や利益計算の続きを開く",
      workflowHref("pc", "products"),
    ],
    [
      "出品準備を確認する",
      "別の見本1点で、商品情報・写真・説明文をまとめて確認",
      workflowHref("pc", "preparation"),
    ],
    [
      "会計の設定を確認する",
      "選択項目・会計年度の入力を試す（申告は実行しません）",
      accountingHref("pc", "44"),
    ],
  ];
  return (
    <>
      <section className={ui.quickActions} aria-label="作業を選ぶ">
        {actions.map(([label, detail, href]) => (
          <a key={label} href={href}>
            <strong>
              {label}
              <span aria-hidden="true">›</span>
            </strong>
            <small>{detail}</small>
          </a>
        ))}
      </section>
      <section className={ui.panel}>
        <IntakeProductList platform="pc" />
      </section>
    </>
  );
}

export function PcBrowserWorkflow({ screenNumber, kind }: { screenNumber?: number; kind?: Kind }) {
  const [query, setQuery] = useState({
    stage: null as string | null,
    screen: null as string | null,
    panel: null as string | null,
  });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery({
      stage: params.get("stage"),
      screen: params.get("screen"),
      panel: params.get("panel"),
    });
  }, []);
  if (isStaticApprovedReview && (screenNumber === 2 || kind === "products"))
    return <SellerWorkspace platform="pc" initialTab={kind === "products" ? "products" : "home"} />;
  if (!isStaticApprovedReview) {
    return (
      <Workspace title="公開確認版の専用画面" active="作業">
        <p>
          この入口は公開の操作確認版で使います。開発環境の業務画面は、既存の入口から開いてください。
        </p>
        <a href={pcPath(3)}>既存の作業画面へ ›</a>
      </Workspace>
    );
  }
  if (screenNumber === 2 || screenNumber === 3) {
    return (
      <Workspace
        title={screenNumber === 2 ? "ホーム" : "作業を始める"}
        active={screenNumber === 2 ? "ホーム" : "作業"}
      >
        <StartWork />
      </Workspace>
    );
  }
  if (screenNumber === 6 || screenNumber === 7 || screenNumber === 8) {
    return (
      <Workspace title="箱の検品と利益" active="仕入れ">
        <section className={ui.panel}>
          <BoxIntakeFlow
            platform="pc"
            screenId={screenNumber === 7 ? "box-03" : screenNumber === 8 ? "box-05" : "box-02"}
            defaultStep={screenNumber === 7 ? "item" : screenNumber === 8 ? "list" : "count"}
          />
        </section>
      </Workspace>
    );
  }
  if (screenNumber === 46 || screenNumber === 47 || screenNumber === 48) {
    const screen =
      screenNumber === 46 ? "44" : screenNumber === 47 ? "45" : pcAccountingScreen(query.stage);
    return (
      <Workspace title={getMobileScreen(screen)?.title ?? "会計の確認"} active="会計">
        <section className={ui.panel}>
          <ReportedReviewFlow key={screen} screenId={screen} platform="pc" />
        </section>
      </Workspace>
    );
  }
  if (kind === "products") {
    return (
      <Workspace title="商品一覧" active="商品">
        <section className={ui.panel}>
          <IntakeProductList platform="pc" />
        </section>
        <section className={ui.panel}>
          <h2>別の見本で出品準備を試す</h2>
          <p className={ui.hint}>
            箱の商品とは別の確認用1点です。箱で入力した内容を置き換えません。
          </p>
          <PreparationProductCard platform="pc" />
        </section>
        <a className={ui.textLink} href={pcPath(9)}>
          管理番号の画面見本を見る ›
        </a>
      </Workspace>
    );
  }
  if (kind === "preparation") {
    return (
      <Workspace title="出品の準備（見本1点）" active="商品">
        <section className={ui.panel}>
          <ProductPreparation
            key={query.panel === "photos" ? "photos" : "info"}
            screenId={query.panel === "photos" ? "29" : "photo-03"}
            platform="pc"
          />
        </section>
      </Workspace>
    );
  }
  if (kind === "recipes") {
    return (
      <Workspace title="写真の編集レシピ（見本）" active="商品">
        <section className={ui.panel}>
          <ReviewRecipePicker />
          <p className={ui.hint}>
            選択の保存だけを試す画面です。画像加工や外部への送信は実行しません。
          </p>
          <a className={ui.textLink} href={workflowHref("pc", "preparation")}>
            出品準備へ戻る ›
          </a>
        </section>
      </Workspace>
    );
  }
  const screen = isPcLocalWorkScreen(query.screen) ? query.screen : "14";
  return (
    <Workspace title={`${getMobileScreen(screen)?.title ?? "商品の作業"}（見本1点）`} active="作業">
      <section className={ui.panel}>
        <LocalReviewFlow key={screen} screenId={screen} platform="pc" />
      </section>
    </Workspace>
  );
}
