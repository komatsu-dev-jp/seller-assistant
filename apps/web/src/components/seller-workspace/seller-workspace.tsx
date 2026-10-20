"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  emptyIntakeState,
  intakeKey,
  parseIntake,
  type IntakeState,
} from "../approved-mobile/box-intake-store";
import { intakeWriteLock } from "../approved-mobile/box-intake-write-lease";
import { reviewPath } from "../approved-mobile/review-path";
import {
  accountingHref,
  workflowHref,
  type ReviewPlatform,
} from "../approved-mobile/review-workflow-routes";
import { Glyph, SellerNavigation, sellerHref, tabs, type SellerTab } from "./navigation";
import { workspaceProducts, type WorkspaceProduct } from "./product-adapter";
import { sampleCommerce, sampleProducts } from "./sample-data";
import {
  addExpense,
  addSale,
  amendSale,
  commerceKey,
  emptyCommerce,
  monthlySummary,
  parseCommerce,
  removeExpense,
  saleProfit,
  setProductLocation,
  setSaleStage,
  writeCommerce,
  type CommerceState,
  type Sale,
} from "./sales-store";
import ui from "./workspace.module.css";

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
const stageLabels = { unpacked: "未梱包", packed: "発送待ち", shipped: "入金待ち", paid: "完了" };
const stageActions = {
  unpacked: "梱包した",
  packed: "発送した",
  shipped: "入金を確認した",
  paid: "完了",
};
const stages = ["unpacked", "packed", "shipped", "paid"] as const;
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
function friendlyError(cause: unknown) {
  return cause instanceof Error && !/quota|denied|JSON|Unexpected|Security/iu.test(cause.message)
    ? cause.message
    : "保存できません。入力は残っています。ブラウザーの保存設定・空き容量を確認してください。";
}
function Photo({
  product,
  hero = false,
}: {
  product?: WorkspaceProduct | undefined;
  hero?: boolean;
}) {
  return product?.image ? (
    // Existing local approved assets only; never fetch a remote product photograph.
    <img
      className={hero ? ui.heroPhoto : ui.photo}
      src={reviewPath(product.image, process.env.NEXT_PUBLIC_REVIEW_BASE_PATH ?? "")}
      alt={`${product.name}（見本）`}
    />
  ) : (
    <span className={hero ? ui.heroPlaceholder : ui.photoPlaceholder}>
      <Glyph name="products" />
      <small>写真なし</small>
    </span>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      returnTo?.focus();
    };
  }, []);
  return (
    <dialog ref={ref} className={ui.dialog} aria-label={title} onCancel={close}>
      <header className={ui.dialogHeader}>
        <h2>{title}</h2>
        <button type="button" onClick={close}>
          閉じる
        </button>
      </header>
      {children}
    </dialog>
  );
}
function MoneyField({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value?: number | undefined;
}) {
  return (
    <label className={ui.field}>
      {label}
      <span className={ui.moneyInput}>
        <span>¥</span>
        <input
          name={name}
          defaultValue={value === undefined ? "" : String(value)}
          inputMode="numeric"
          pattern="[0-9]{1,9}"
          required
          maxLength={9}
        />
      </span>
    </label>
  );
}
function formText(data: FormData, key: string) {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}
function amount(data: FormData, key: string) {
  const value = formText(data, key);
  if (!/^[0-9]{1,9}$/.test(value) || Number(value) > 100000000)
    throw new Error(
      "金額を0〜100,000,000円の整数で入力してください。未入力の費用も確認し、不要なら0と入力してください。",
    );
  return Number(value);
}
type Popup =
  | { type: "sale"; productId?: string; editId?: string }
  | { type: "detail"; productId: string }
  | { type: "expense" }
  | { type: "deleteExpense"; id: string; title: string }
  | { type: "leave"; href: string }
  | { type: "stage"; saleId: string; from: Sale["stage"]; to: Sale["stage"] }
  | { type: "location"; productId: string };

export function SellerWorkspace({
  platform = "mobile",
  initialTab = "home",
}: {
  platform?: ReviewPlatform;
  initialTab?: SellerTab;
}) {
  const [tab, setTab] = useState<SellerTab>(initialTab);
  const [intake, setIntake] = useState<IntakeState>(emptyIntakeState);
  const [commerce, setCommerce] = useState<CommerceState>(emptyCommerce);
  const [sample, setSample] = useState<CommerceState | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const raw = useRef<string | null>(null);
  const intakeRaw = useRef<string | null>(null);
  const [month, setMonth] = useState("");
  const [query, setQuery] = useState("");
  const [productFilter, setProductFilter] = useState("all");
  const [shippingFilter, setShippingFilter] = useState("all");
  const [popup, setPopup] = useState<Popup | null>(null);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [tools, setTools] = useState(false);
  const refresh = () => {
    try {
      const nextIntakeRaw = window.localStorage.getItem(intakeKey);
      const nextRaw = window.localStorage.getItem(commerceKey);
      const nextIntake = parseIntake(nextIntakeRaw);
      const next = parseCommerce(nextRaw);
      setIntake(nextIntake);
      setCommerce(next);
      raw.current = nextRaw;
      intakeRaw.current = nextIntakeRaw;
      setReady(true);
      setLoadError("");
    } catch (cause) {
      setReady(false);
      setLoadError(friendlyError(cause));
    }
  };
  useEffect(() => {
    setMonth(today().slice(0, 7));
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (tabs.some(([key]) => key === requested)) setTab(requested as SellerTab);
    refresh();
    const restoreTab = () => {
      const requested = new URLSearchParams(window.location.search).get("tab");
      setTab(
        tabs.some(([id]) => id === requested)
          ? (requested as SellerTab)
          : window.location.pathname.includes("/products")
            ? "products"
            : "home",
      );
      setPopup(null);
    };
    window.addEventListener("popstate", restoreTab);
    return () => window.removeEventListener("popstate", restoreTab);
  }, []);
  useEffect(() => {
    // Never silently replace the backing version while a user is completing a form.
    const update = () => {
      if (!popup && !busyRef.current) refresh();
    };
    const changed = (event: StorageEvent) => {
      if (event.key === null || event.key === intakeKey || event.key === commerceKey) update();
    };
    window.addEventListener("focus", update);
    window.addEventListener("storage", changed);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("storage", changed);
    };
  }, [popup]);

  const state = sample ?? commerce;
  const products = sample ? sampleProducts : workspaceProducts(intake, platform);
  const productIds = new Set(products.map((product) => product.id));
  const salesByProduct = new Map(state.sales.map((sale) => [sale.productId, sale]));
  // Sales retain their product snapshot if an older intake record is no longer present.
  const allProducts = [
    ...products,
    ...state.sales
      .filter((sale) => !productIds.has(sale.productId))
      .map((sale) => ({
        id: sale.productId,
        name: sale.productName,
        subtitle: "売却時の記録",
        registered: true,
        sellable: false,
        estimate: null,
        cost: sale.costYen,
        href: "",
        image: null,
      })),
  ];
  const summary = month
    ? monthlySummary(state, tab === "home" ? today().slice(0, 7) : month)
    : null;
  const outstanding = state.sales.filter((sale) => sale.stage !== "paid");
  const incompleteBoxes = intake.boxes.filter(
    (box) => !box.confirmed || box.items.some((item) => !item.registered),
  );
  const productsById = new Map(allProducts.map((product) => [product.id, product]));
  const item = (id: string) => productsById.get(id);
  const saleFor = (id: string) => salesByProduct.get(id);
  const editingSale =
    popup?.type === "sale" && popup.editId
      ? state.sales.find((sale) => sale.id === popup.editId)
      : undefined;
  const close = () => {
    if (!busyRef.current) {
      setPopup(null);
      setError("");
    }
  };
  const open = (value: Popup) => {
    setError("");
    setNotice("");
    setPopup(value);
    if (value.type === "sale") setSelectedProduct(value.productId ?? "");
  };
  const mutate = async (change: (value: CommerceState) => CommerceState, productId?: string) => {
    if (busyRef.current || (!ready && !sample)) return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (sample) {
        setSample(change(sample));
        setNotice("見本の操作を反映しました（保存はしません）。");
      } else {
        if (!navigator.locks)
          throw new Error(
            "安全な保存機能が使えません。最新版のSafariなどでHTTPSのページから開いてください。",
          );
        await navigator.locks.request(
          "seller-workspace-commerce-editor-v1",
          { ifAvailable: true },
          async (lock) => {
            if (!lock) throw new Error("別のタブが保存中です。少し待って再度保存してください。");
            const save = () => {
              if (productId) {
                const currentIntakeRaw = window.localStorage.getItem(intakeKey);
                if (currentIntakeRaw !== intakeRaw.current)
                  throw new Error(
                    "商品情報が別の画面で変わりました。入力を控えて閉じ、一覧を更新してから売上を登録してください。",
                  );
                const current = workspaceProducts(parseIntake(currentIntakeRaw), platform).find(
                  (p) => p.id === productId,
                );
                if (!current?.sellable)
                  throw new Error("検品で「販売できる」と登録された商品を選んでください。");
              }
              const next = change(commerce);
              const nextRaw = writeCommerce(window.localStorage, next, raw.current);
              raw.current = nextRaw;
              setCommerce(next);
            };
            if (productId) {
              await navigator.locks.request(
                intakeWriteLock,
                { ifAvailable: true },
                (intakeLock) => {
                  if (!intakeLock)
                    throw new Error(
                      "別のタブで箱を編集中です。箱の画面を閉じてから売上を保存してください。",
                    );
                  save();
                },
              );
            } else save();
          },
        );
        setNotice("このブラウザーに保存しました。");
      }
      return true;
    } catch (cause) {
      setError(friendlyError(cause));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const saveSale = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const data = new FormData(event.currentTarget);
      const product = item(selectedProduct);
      if (!product || (!editingSale && !product.sellable))
        throw new Error("売れた商品を選んでください。");
      const sale: Sale = {
        id: editingSale?.id ?? crypto.randomUUID(),
        productId: product.id,
        productName: editingSale?.productName ?? product.name,
        channel: formText(data, "channel").trim(),
        soldOn: formText(data, "soldOn"),
        deadline: formText(data, "deadline"),
        priceYen: amount(data, "price"),
        costYen: amount(data, "cost"),
        feeYen: amount(data, "fee"),
        shippingYen: amount(data, "shipping"),
        packingYen: amount(data, "packing"),
        stage: editingSale?.stage ?? "unpacked",
        location: editingSale?.location ?? state.locations[product.id] ?? "",
      };
      if (
        await mutate(
          (previous) => (editingSale ? amendSale(previous, sale) : addSale(previous, sale)),
          editingSale ? undefined : product.id,
        )
      ) {
        setPopup(null);
        setTab("shipping");
        setShippingFilter(sale.stage);
      }
    } catch (cause) {
      setError(friendlyError(cause));
    }
  };
  const saveExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const data = new FormData(event.currentTarget);
      const expense = {
        id: crypto.randomUUID(),
        title: formText(data, "title").trim(),
        date: formText(data, "date"),
        amountYen: amount(data, "amount"),
      };
      if (await mutate((previous) => addExpense(previous, expense))) setPopup(null);
    } catch (cause) {
      setError(friendlyError(cause));
    }
  };
  const advance = (sale: Sale) => {
    open({
      type: "stage",
      saleId: sale.id,
      from: sale.stage,
      to: stages[Math.min(stages.indexOf(sale.stage) + 1, 3)]!,
    });
  };
  const moneyClass = (value: number) => (value < 0 ? ui.negative : ui.positive);
  const pendingCount = outstanding.length + (sample ? 1 : incompleteBoxes.length);
  const panelError = error ? (
    <p role="alert" className={ui.error}>
      {error}
    </p>
  ) : null;
  const activeProduct = popup && "productId" in popup ? item(popup.productId ?? "") : undefined;
  const activeSale = activeProduct ? saleFor(activeProduct.id) : undefined;

  return (
    <main
      className={ui.workspace}
      data-platform={platform}
      data-implementation-scope="seller-workspace"
      onClickCapture={(event) => {
        const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
        if (sample && link && !link.closest("nav")) {
          event.preventDefault();
          open({ type: "leave", href: (link as HTMLAnchorElement).href });
        }
      }}
    >
      <div className={ui.main}>
        <header className={ui.header}>
          <div>
            <span className={ui.eyebrow}>Seller Assistant</span>
            <h1>{tabs.find(([id]) => id === tab)?.[1]}</h1>
          </div>
          <span className={ui.mode}>{sample ? "見本データ" : "端末内の確認版"}</span>
        </header>
        <div className={ui.modeBar}>
          <span>
            {sample
              ? "架空の3商品 · 操作は保存しません"
              : "このブラウザーだけに保存 · 端末間共有なし"}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setSample(sample ? null : sampleCommerce(today().slice(0, 7)));
              setPopup(null);
              setNotice("");
              setError("");
              setMonth(today().slice(0, 7));
            }}
          >
            {sample ? "自分の記録へ" : "見本を見る"}
          </button>
        </div>
        <p className={ui.safety}>操作確認版です。実商品・個人情報はまだ入力しないでください。</p>
        {loadError && !sample ? (
          <div role="alert" className={ui.error}>
            {loadError}
            <button type="button" onClick={refresh}>
              読み込みを再試行
            </button>
          </div>
        ) : null}
        {!ready && !sample && !loadError ? <p role="status">保存内容を読み込んでいます…</p> : null}
        {notice ? (
          <p role="status" className={ui.notice}>
            {notice}
          </p>
        ) : null}
        {!popup ? panelError : null}
        {ready || sample ? (
          <>
            {tab === "home" && summary ? (
              <>
                <section className={ui.profitCard}>
                  <div>
                    <h2>今月の利益</h2>
                    <strong className={`${ui.largeMoney} ${moneyClass(summary.netProfit)}`}>
                      {yen(summary.netProfit)}
                    </strong>
                  </div>
                  <dl>
                    <div>
                      <dt>売上</dt>
                      <dd>{yen(summary.revenue)}</dd>
                    </div>
                    <div>
                      <dt>経費</dt>
                      <dd>{yen(summary.expenses)}</dd>
                    </div>
                  </dl>
                </section>
                <p className={ui.caption}>
                  商品利益 {yen(summary.productProfit)} · 入金とは別に管理
                </p>
                <div className={ui.quickActions}>
                  <button
                    className={ui.primary}
                    type="button"
                    onClick={() => open({ type: "sale" })}
                  >
                    <Glyph name="plus" />
                    売れたを記録
                  </button>
                  <a className={ui.secondary} href={workflowHref(platform, "intake")}>
                    <Glyph name="box" />
                    箱の検品
                  </a>
                </div>
                <section className={ui.section}>
                  <h2>
                    今日やること <span className={ui.count}>{pendingCount}</span>
                  </h2>
                  {outstanding.slice(0, 5).map((sale) => (
                    <button
                      key={sale.id}
                      className={ui.task}
                      type="button"
                      onClick={() => {
                        setTab("shipping");
                        setShippingFilter(sale.stage);
                      }}
                    >
                      <Photo product={item(sale.productId)} />
                      <span>
                        <strong>{sale.productName}</strong>
                        <span className={ui.badge}>{stageLabels[sale.stage]}</span>
                        <small>発送期限 {sale.deadline}</small>
                      </span>
                      <span className={ui.link}>
                        {sale.stage === "unpacked"
                          ? "梱包する"
                          : sale.stage === "packed"
                            ? "発送する"
                            : "入金を確認"}
                        <Glyph name="arrow" />
                      </span>
                    </button>
                  ))}
                  {(sample
                    ? [{ id: "sample-box", name: "仕入箱014", count: 12, registered: 3 }]
                    : incompleteBoxes.map((box) => ({
                        ...box,
                        registered: box.items.filter((p) => p.registered).length,
                      }))
                  )
                    .slice(0, 5)
                    .map((box) => (
                      <a
                        key={box.id}
                        className={ui.task}
                        href={`${workflowHref(platform, "intake")}${sample ? "" : `?box=${encodeURIComponent(box.id)}&step=list`}`}
                      >
                        <span className={ui.boxIcon}>
                          <Glyph name="box" />
                        </span>
                        <span>
                          <strong>{box.name || "名前のない箱"}</strong>
                          <small>
                            検品 {box.registered} / {box.count}点
                          </small>
                          <progress value={box.registered} max={box.count || 1} />
                        </span>
                        <span className={ui.link}>
                          {sample ? "箱を登録" : "続きへ"}
                          <Glyph name="arrow" />
                        </span>
                      </a>
                    ))}
                  {!pendingCount ? (
                    <div className={ui.empty}>
                      <Glyph name="box" />
                      <h3>次の作業を、ここから。</h3>
                      <p>届いた箱を検品して商品を登録すると、続きの作業がここに表示されます。</p>
                      <a className={ui.secondary} href={workflowHref(platform, "intake")}>
                        最初の箱を登録
                      </a>
                    </div>
                  ) : null}
                  {outstanding.length > 5 ? (
                    <button className={ui.textButton} onClick={() => setTab("shipping")}>
                      発送をすべて見る ›
                    </button>
                  ) : null}
                </section>
              </>
            ) : null}
            {tab === "products" ? (
              <>
                <div className={ui.searchRow}>
                  <label className={ui.search}>
                    <Glyph name="search" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="商品名・番号・保管場所で検索"
                      aria-label="商品を検索"
                    />
                  </label>
                  <a
                    className={ui.add}
                    href={workflowHref(platform, "intake")}
                    aria-label="箱から商品を追加"
                  >
                    <Glyph name="plus" />
                  </a>
                </div>
                <div className={ui.segmented} aria-label="商品の絞り込み">
                  {[
                    ["all", "すべて"],
                    ["stock", "在庫"],
                    ["sold", "売却"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      aria-pressed={productFilter === id}
                      onClick={() => setProductFilter(id!)}
                    >
                      {label}{" "}
                      <small>
                        {
                          allProducts.filter(
                            (p) =>
                              id === "all" || (id === "sold" ? !!saleFor(p.id) : !saleFor(p.id)),
                          ).length
                        }
                      </small>
                    </button>
                  ))}
                </div>
                <div className={ui.listHeading}>
                  <span>商品・保管場所</span>
                  <span>利益</span>
                </div>
                <section className={ui.productList} aria-label="商品一覧">
                  {allProducts
                    .filter(
                      (p) =>
                        (productFilter === "all" ||
                          (productFilter === "sold" ? !!saleFor(p.id) : !saleFor(p.id))) &&
                        `${p.name} ${p.id} ${state.locations[p.id] ?? ""} ${p.subtitle}`
                          .toLocaleLowerCase()
                          .includes(query.trim().toLocaleLowerCase()),
                    )
                    .map((product) => {
                      const sale = saleFor(product.id);
                      const profit = sale ? saleProfit(sale) : product.estimate;
                      return (
                        <div key={product.id} className={ui.productRow}>
                          <Photo product={product} />
                          <div className={ui.productInfo}>
                            <strong>{product.name}</strong>
                            <small>
                              {sale ? "売却" : product.registered ? "在庫" : "検品中"} ·{" "}
                              {state.locations[product.id] || "保管場所 未設定"}
                            </small>
                            <small>{product.subtitle}</small>
                            <span>
                              {sale ? "商品利益" : "見込み"}{" "}
                              <b className={profit !== null ? moneyClass(profit) : ""}>
                                {profit === null ? "未計算" : yen(profit)}
                              </b>
                            </span>
                          </div>
                          <button
                            className={ui.openButton}
                            type="button"
                            onClick={() => open({ type: "detail", productId: product.id })}
                          >
                            開く
                          </button>
                        </div>
                      );
                    })}
                  {!allProducts.length ? (
                    <div className={ui.empty}>
                      <h3>箱から商品を登録しましょう</h3>
                      <p>検品した商品を、売上・発送まで同じ一覧で管理できます。</p>
                      <a href={workflowHref(platform, "intake")} className={ui.primary}>
                        箱の検品を始める
                      </a>
                    </div>
                  ) : null}
                  {allProducts.length &&
                  !allProducts.some(
                    (p) =>
                      (productFilter === "all" ||
                        (productFilter === "sold" ? !!saleFor(p.id) : !saleFor(p.id))) &&
                      `${p.name} ${p.id} ${state.locations[p.id] ?? ""} ${p.subtitle}`
                        .toLocaleLowerCase()
                        .includes(query.trim().toLocaleLowerCase()),
                  ) ? (
                    <p className={ui.empty}>条件に一致する商品はありません。</p>
                  ) : null}
                </section>
                <section className={ui.section}>
                  <h2>箱・保管場所</h2>
                  <div className={ui.toolGrid}>
                    <a href={workflowHref(platform, "intake")}>
                      <Glyph name="box" />
                      箱の検品
                    </a>
                    <button onClick={() => setTools(!tools)} aria-expanded={tools}>
                      <Glyph name="products" />
                      保管場所・在庫数
                    </button>
                  </div>
                  {tools ? (
                    <div className={ui.card}>
                      <h3>在庫 {allProducts.filter((p) => !saleFor(p.id)).length}点</h3>
                      <p className={ui.caption}>
                        未売却の登録・検品中商品を含みます。商品を開くと場所を変更できます。
                      </p>
                      {Array.from(
                        new Set(
                          allProducts
                            .filter((p) => !saleFor(p.id))
                            .map((p) => state.locations[p.id] || "未設定"),
                        ),
                      ).map((location) => (
                        <div className={ui.dataRow} key={location}>
                          <span>{location}</span>
                          <strong>
                            {
                              allProducts.filter(
                                (p) =>
                                  !saleFor(p.id) &&
                                  (state.locations[p.id] || "未設定") === location,
                              ).length
                            }
                            点
                          </strong>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              </>
            ) : null}
            {tab === "shipping" ? (
              <>
                <section className={ui.shippingCounts} aria-label="発送の進捗">
                  {stages.slice(0, 3).map((stage) => (
                    <button
                      key={stage}
                      aria-pressed={shippingFilter === stage}
                      onClick={() => setShippingFilter(stage)}
                    >
                      <span>{stageLabels[stage]}</span>
                      <strong>{state.sales.filter((sale) => sale.stage === stage).length}</strong>
                    </button>
                  ))}
                </section>
                <div className={ui.filterLinks}>
                  <button
                    aria-pressed={shippingFilter === "all"}
                    onClick={() => setShippingFilter("all")}
                  >
                    未完了すべて
                  </button>
                  <button
                    aria-pressed={shippingFilter === "paid"}
                    onClick={() => setShippingFilter("paid")}
                  >
                    完了 {state.sales.filter((sale) => sale.stage === "paid").length}
                  </button>
                </div>
                <div className={ui.shippingGrid}>
                  {state.sales
                    .filter((sale) =>
                      shippingFilter === "all"
                        ? sale.stage !== "paid"
                        : sale.stage === shippingFilter,
                    )
                    .map((sale) => (
                      <article key={sale.id} className={ui.shippingCard}>
                        <Photo product={item(sale.productId)} hero />
                        <div className={ui.titleRow}>
                          <div>
                            <h2>{sale.productName}</h2>
                            <p>{sale.channel}</p>
                          </div>
                          <span className={ui.badge}>{stageLabels[sale.stage]}</span>
                        </div>
                        <div className={ui.dataRow}>
                          <span>保管場所（売却時）</span>
                          <b>{sale.location || "未設定"}</b>
                        </div>
                        <div className={ui.dataRow}>
                          <span>発送期限</span>
                          <b>{sale.deadline}</b>
                        </div>
                        <div className={ui.dataRow}>
                          <span>販売価格</span>
                          <b>{yen(sale.priceYen)}</b>
                        </div>
                        <ol className={ui.steps} aria-label="発送工程">
                          {["売却", "梱包", "発送", "入金"].map((label, index) => (
                            <li key={label} data-done={index <= stages.indexOf(sale.stage)}>
                              <span>{index <= stages.indexOf(sale.stage) ? "✓" : index + 1}</span>
                              {label}
                            </li>
                          ))}
                        </ol>
                        {sale.stage !== "paid" ? (
                          <button
                            disabled={busy}
                            className={ui.primary}
                            onClick={() => advance(sale)}
                          >
                            {stageActions[sale.stage]}
                          </button>
                        ) : (
                          <p className={ui.notice}>入金確認まで完了しました</p>
                        )}
                        <button
                          className={ui.textButton}
                          onClick={() => open({ type: "detail", productId: sale.productId })}
                        >
                          記録の詳細・進捗の訂正 ›
                        </button>
                      </article>
                    ))}
                </div>
                {!state.sales.some((sale) =>
                  shippingFilter === "all" ? sale.stage !== "paid" : sale.stage === shippingFilter,
                ) ? (
                  <div className={ui.empty}>
                    <Glyph name="shipping" />
                    <h3>該当する発送はありません</h3>
                    <p>「売れたを記録」すると、梱包から入金確認まで続けられます。</p>
                    <button className={ui.secondary} onClick={() => open({ type: "sale" })}>
                      売れたを記録
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
            {tab === "reports" && summary ? (
              <>
                <label className={ui.month}>
                  集計月
                  <input
                    type="month"
                    value={month}
                    min="2000-01"
                    max="2099-12"
                    onChange={(event) => {
                      if (/^(?:20\d{2})-(?:0[1-9]|1[0-2])$/.test(event.target.value))
                        setMonth(event.target.value);
                    }}
                  />
                </label>
                <div className={ui.summaryGrid}>
                  <section className={ui.card}>
                    <h2>売上</h2>
                    <strong className={ui.blueMoney}>{yen(summary.revenue)}</strong>
                  </section>
                  <section className={ui.card}>
                    <h2>利益</h2>
                    <strong className={`${ui.blueMoney} ${moneyClass(summary.netProfit)}`}>
                      {yen(summary.netProfit)}
                    </strong>
                  </section>
                </div>
                <section className={ui.card}>
                  <h2>利益の内訳</h2>
                  {[
                    ["売れた商品の仕入れ", summary.cost],
                    ["手数料", summary.fees],
                    ["送料", summary.shipping],
                    ["梱包費", summary.packing],
                    ["その他の経費", summary.expenses],
                  ].map(([label, value]) => (
                    <div className={ui.dataRow} key={String(label)}>
                      <span>{label}</span>
                      <strong>−{yen(Number(value))}</strong>
                    </div>
                  ))}
                  <div className={`${ui.dataRow} ${ui.total}`}>
                    <strong>記録上の利益</strong>
                    <strong className={moneyClass(summary.netProfit)}>
                      {yen(summary.netProfit)}
                    </strong>
                  </div>
                  <p className={ui.caption}>
                    売却日で集計。経費は記録日で集計します。税額・確定申告の計算ではありません。
                  </p>
                </section>
                <section className={ui.card}>
                  <div className={ui.dataRow}>
                    <span>この月に売れた商品の入金確認済み売上</span>
                    <strong>{yen(summary.paidRevenue)}</strong>
                  </div>
                  <p className={ui.caption}>
                    手数料控除前の売上です。実際の振込額・今月の入金額ではありません。
                  </p>
                </section>
                <section className={ui.section}>
                  <h2>
                    売れた商品 <span className={ui.count}>{summary.count}点</span>
                  </h2>
                  {state.sales
                    .filter((sale) => sale.soldOn.startsWith(month))
                    .map((sale) => (
                      <button
                        className={ui.task}
                        key={sale.id}
                        onClick={() => open({ type: "detail", productId: sale.productId })}
                      >
                        <Photo product={item(sale.productId)} />
                        <span>
                          <strong>{sale.productName}</strong>
                          <small>
                            {sale.channel} · {sale.soldOn}
                          </small>
                        </span>
                        <span>
                          <small>商品利益</small>
                          <b className={moneyClass(saleProfit(sale))}>{yen(saleProfit(sale))}</b>
                        </span>
                      </button>
                    ))}
                  {!summary.count ? (
                    <p className={ui.caption}>この月の売上記録はありません。</p>
                  ) : null}
                </section>
                <button className={ui.secondary} onClick={() => open({ type: "expense" })}>
                  <Glyph name="plus" />
                  経費を記録する
                </button>
                <section className={ui.section}>
                  <h2>経費の記録</h2>
                  <p className={ui.caption}>
                    売上で入力した送料・梱包費は、ここに重複して登録しないでください。
                  </p>
                  {state.expenses
                    .filter((expense) => expense.date.startsWith(month))
                    .map((expense) => (
                      <div className={ui.dataRow} key={expense.id}>
                        <span>
                          {expense.title}
                          <small>{expense.date}</small>
                        </span>
                        <strong>{yen(expense.amountYen)}</strong>
                        <button
                          className={ui.textButton}
                          disabled={busy}
                          onClick={() => {
                            open({ type: "deleteExpense", id: expense.id, title: expense.title });
                          }}
                        >
                          削除
                        </button>
                      </div>
                    ))}
                </section>
              </>
            ) : null}
            {tab === "settings" ? (
              <>
                <section className={ui.card}>
                  <h2>保存と共有</h2>
                  <p>
                    箱・商品・売上・発送は、このブラウザー内に保存します。別のスマホ・PCとの自動共有は未対応です。同じ端末でも、ブラウザーを変えると記録は共有されません。
                  </p>
                  <p>有料API・外部への自動送信・自動出品は使用しません。</p>
                  <button
                    className={ui.secondary}
                    onClick={() => {
                      const blob = new Blob(
                        [
                          JSON.stringify(
                            {
                              scope: "seller-workspace-backup",
                              exportedAt: new Date().toISOString(),
                              intake: sample ? null : intake,
                              commerce: state,
                            },
                            null,
                            2,
                          ),
                        ],
                        { type: "application/json" },
                      );
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = `seller-records-${today()}${sample ? "-sample" : ""}.json`;
                      link.click();
                      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}
                  >
                    記録の控えを保存
                  </button>
                  <p className={ui.caption}>
                    この画面の箱・売上・発送・経費・保管場所の控えです。写真・別の見本・会計設定は含みません。控えの再取込は未対応です。
                  </p>
                </section>
                <section className={ui.card}>
                  <h2>設定・これまでの作業</h2>
                  <a className={ui.settingLink} href={accountingHref(platform, "44")}>
                    会計の基本設定（操作確認）
                    <Glyph name="arrow" />
                  </a>
                  <a className={ui.settingLink} href={workflowHref(platform, "work")}>
                    検品・撮影・採寸の作業一覧
                    <Glyph name="arrow" />
                  </a>
                  <a className={ui.settingLink} href={workflowHref(platform, "preparation")}>
                    写真・説明文の操作見本
                    <Glyph name="arrow" />
                  </a>
                </section>
                <section className={ui.card}>
                  <h2>利益の見方</h2>
                  <p>
                    商品利益＝売上 − 仕入れ − 手数料 − 送料 −
                    梱包費。月の利益は、さらにその月の経費を差し引きます。
                  </p>
                  <p>未売却の商品は「見込み」と表示し、月の売上・利益には入れません。</p>
                </section>
              </>
            ) : null}
          </>
        ) : null}
      </div>
      <SellerNavigation
        platform={platform}
        active={tab}
        onNavigate={(next) => {
          setTab(next);
          window.history.pushState(null, "", sellerHref(platform, next));
          setNotice("");
          setError("");
        }}
      />
      {popup ? (
        <Modal
          title={
            popup.type === "sale"
              ? editingSale
                ? "売上の内容を訂正"
                : "売れたを記録"
              : popup.type === "stage"
                ? "進み具合を確認"
                : popup.type === "leave"
                  ? "見本を終了しますか？"
                  : popup.type === "deleteExpense"
                    ? "経費記録を削除しますか？"
                    : popup.type === "expense"
                      ? "経費を記録"
                      : popup.type === "location"
                        ? "保管場所を変更"
                        : "商品の詳細"
          }
          close={close}
        >
          {sample ? <p className={ui.sampleNote}>見本の操作です。保存しません。</p> : null}
          {panelError}
          {popup.type === "leave" ? (
            <div className={ui.form}>
              <p>
                見本を終了し、このブラウザーに保存する作業画面を開きます。見本での変更は保存されません。
              </p>
              <button className={ui.primary} onClick={() => window.location.assign(popup.href)}>
                保存する作業画面へ進む
              </button>
              <button className={ui.secondary} onClick={close}>
                見本に戻る
              </button>
            </div>
          ) : null}
          {popup.type === "stage" ? (
            <div className={ui.form}>
              <h3>{state.sales.find((sale) => sale.id === popup.saleId)?.productName}</h3>
              <p>
                {stageLabels[popup.from]} → <strong>{stageLabels[popup.to]}</strong>
              </p>
              <p className={ui.caption}>
                実際の作業が済んだことを確認して記録してください。外部サービスには送信しません。
              </p>
              <button
                className={ui.primary}
                disabled={busy}
                onClick={() => {
                  void mutate((value) => {
                    if (value.sales.find((sale) => sale.id === popup.saleId)?.stage !== popup.from)
                      throw new Error(
                        "進捗が変更されています。一度閉じて最新の内容を確認してください。",
                      );
                    return setSaleStage(value, popup.saleId, popup.to);
                  }).then((saved) => {
                    if (saved) {
                      setShippingFilter(popup.to);
                      setPopup(null);
                    }
                  });
                }}
              >
                確認して進捗を保存
              </button>
              <button className={ui.secondary} disabled={busy} onClick={close}>
                変更せず戻る
              </button>
            </div>
          ) : null}
          {popup.type === "deleteExpense" ? (
            <div className={ui.form}>
              <p>「{popup.title}」の記録を削除します。この操作は取り消せません。</p>
              <button
                className={ui.primary}
                disabled={busy}
                onClick={() => {
                  void mutate((value) => removeExpense(value, popup.id)).then((saved) => {
                    if (saved) setPopup(null);
                  });
                }}
              >
                この経費記録を削除
              </button>
              <button className={ui.secondary} onClick={close}>
                削除せず戻る
              </button>
            </div>
          ) : null}
          {popup.type === "sale" ? (
            <form
              key={editingSale?.id ?? "new-sale"}
              onSubmit={(event) => {
                void saveSale(event);
              }}
              className={ui.form}
            >
              <label className={ui.field}>
                売れた商品
                <select
                  required
                  disabled={!!editingSale}
                  value={selectedProduct}
                  onChange={(event) => setSelectedProduct(event.target.value)}
                >
                  <option value="">商品を選択</option>
                  {allProducts
                    .filter((p) =>
                      editingSale ? p.id === editingSale.productId : p.sellable && !saleFor(p.id),
                    )
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              {!editingSale && !products.some((p) => p.sellable && !saleFor(p.id)) ? (
                <p>
                  販売できる未売却の商品がありません。
                  <a href={workflowHref(platform, "intake")}>箱の検品で商品を登録</a>してください。
                </p>
              ) : null}
              <label className={ui.field}>
                販売先
                <select name="channel" required defaultValue={editingSale?.channel ?? ""}>
                  <option value="">選択してください</option>
                  {["メルカリ", "ラクマ", "Yahoo!フリマ", "Yahoo!オークション", "その他"].map(
                    (label) => (
                      <option key={label}>{label}</option>
                    ),
                  )}
                </select>
              </label>
              <div className={ui.formGrid}>
                <label className={ui.field}>
                  売却日
                  <input
                    name="soldOn"
                    type="date"
                    required
                    defaultValue={editingSale?.soldOn ?? today()}
                  />
                </label>
                <label className={ui.field}>
                  発送期限
                  <input
                    name="deadline"
                    type="date"
                    required
                    defaultValue={editingSale?.deadline ?? today()}
                  />
                </label>
              </div>
              <MoneyField name="price" label="販売価格" value={editingSale?.priceYen} />
              <MoneyField
                key={selectedProduct}
                name="cost"
                label="仕入れ原価（箱の配分額を確認）"
                value={editingSale?.costYen ?? item(selectedProduct)?.cost ?? undefined}
              />
              <div className={ui.formGrid}>
                <MoneyField name="fee" label="販売手数料" value={editingSale?.feeYen} />
                <MoneyField name="shipping" label="送料" value={editingSale?.shippingYen} />
                <MoneyField name="packing" label="梱包費・その他" value={editingSale?.packingYen} />
              </div>
              <p className={ui.caption}>
                実際の取引画面で金額を確認してください。不要な費用は0を入力。登録後は発送へ進みます。外部へは送信しません。
              </p>
              <label className={ui.checkbox}>
                <input type="checkbox" required />
                商品・金額・日付を確認しました
              </label>
              <button className={ui.primary} disabled={busy || !selectedProduct}>
                {busy ? "保存中…" : editingSale ? "確認して訂正を保存" : "確認して売上を保存"}
              </button>
            </form>
          ) : null}
          {popup.type === "expense" ? (
            <form
              className={ui.form}
              onSubmit={(event) => {
                void saveExpense(event);
              }}
            >
              <label className={ui.field}>
                経費の内容
                <input name="title" required maxLength={200} placeholder="例：保管用品" />
              </label>
              <label className={ui.field}>
                記録日
                <input name="date" type="date" required defaultValue={today()} />
              </label>
              <MoneyField name="amount" label="金額" />
              <p className={ui.caption}>売上登録の送料・梱包費とは重複させないでください。</p>
              <button className={ui.primary} disabled={busy}>
                経費を保存
              </button>
            </form>
          ) : null}
          {popup.type === "location" && activeProduct ? (
            <form
              className={ui.form}
              onSubmit={(event) => {
                event.preventDefault();
                const location = formText(new FormData(event.currentTarget), "location").trim();
                void mutate((value) => setProductLocation(value, activeProduct.id, location)).then(
                  (saved) => {
                    if (saved) setPopup({ type: "detail", productId: activeProduct.id });
                  },
                );
              }}
            >
              <p>{activeProduct.name}</p>
              <label className={ui.field}>
                保管場所
                <input
                  name="location"
                  maxLength={100}
                  defaultValue={state.locations[activeProduct.id] ?? ""}
                  placeholder="例：棚A・箱2"
                />
              </label>
              <p className={ui.caption}>
                空欄で保存すると未設定になります。売却時の記録には遡って反映されません。
              </p>
              <button disabled={busy} className={ui.primary}>
                保管場所を保存
              </button>
            </form>
          ) : null}
          {popup.type === "detail" && activeProduct ? (
            <div className={ui.detail}>
              <div className={ui.detailTitle}>
                <Photo product={activeProduct} />
                <div>
                  <h2>{activeProduct.name}</h2>
                  <p>
                    {activeSale
                      ? `${activeSale.channel} · ${stageLabels[activeSale.stage]}`
                      : activeProduct.subtitle}
                  </p>
                  <small>{activeProduct.id}</small>
                </div>
              </div>
              <div className={ui.dataRow}>
                <span>現在の保管場所</span>
                <b>{state.locations[activeProduct.id] || "未設定"}</b>
                <button
                  className={ui.textButton}
                  onClick={() => open({ type: "location", productId: activeProduct.id })}
                >
                  変更
                </button>
              </div>
              {activeSale ? (
                <>
                  <section className={ui.card}>
                    <h3>商品利益</h3>
                    <strong className={`${ui.largeMoney} ${moneyClass(saleProfit(activeSale))}`}>
                      {yen(saleProfit(activeSale))}
                    </strong>
                    {[
                      ["販売価格", activeSale.priceYen],
                      ["仕入れ", -activeSale.costYen],
                      ["手数料", -activeSale.feeYen],
                      ["送料", -activeSale.shippingYen],
                      ["梱包費", -activeSale.packingYen],
                    ].map(([label, value]) => (
                      <div className={ui.dataRow} key={String(label)}>
                        <span>{label}</span>
                        <b>{yen(Number(value))}</b>
                      </div>
                    ))}
                  </section>
                  <section className={ui.card}>
                    <div className={ui.dataRow}>
                      <span>売却日</span>
                      <b>{activeSale.soldOn}</b>
                    </div>
                    <div className={ui.dataRow}>
                      <span>発送期限</span>
                      <b>{activeSale.deadline}</b>
                    </div>
                    <div className={ui.dataRow}>
                      <span>売却時の保管場所</span>
                      <b>{activeSale.location || "未設定"}</b>
                    </div>
                  </section>
                  <button
                    className={ui.secondary}
                    disabled={busy}
                    onClick={() =>
                      open({ type: "sale", productId: activeSale.productId, editId: activeSale.id })
                    }
                  >
                    売上の金額・日付を訂正
                  </button>
                  {activeSale.stage !== "paid" ? (
                    <button
                      className={ui.primary}
                      disabled={busy}
                      onClick={() => advance(activeSale)}
                    >
                      {stageActions[activeSale.stage]}
                    </button>
                  ) : null}
                  {activeSale.stage !== "unpacked" ? (
                    <button
                      className={ui.textButton}
                      disabled={busy}
                      onClick={() => {
                        open({
                          type: "stage",
                          saleId: activeSale.id,
                          from: activeSale.stage,
                          to: stages[stages.indexOf(activeSale.stage) - 1]!,
                        });
                      }}
                    >
                      進捗を1段階戻して訂正
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <section className={ui.card}>
                    <h3>見込み利益</h3>
                    <strong className={ui.blueMoney}>
                      {activeProduct.estimate === null ? "未計算" : yen(activeProduct.estimate)}
                    </strong>
                    <p className={ui.caption}>売上にはまだ含まれていません。</p>
                  </section>
                  {activeProduct.href ? (
                    <a className={ui.secondary} href={activeProduct.href}>
                      {activeProduct.registered
                        ? "商品情報・見込み利益を編集"
                        : "検品・登録を続ける"}{" "}
                      ›
                    </a>
                  ) : null}
                  <button
                    className={ui.primary}
                    disabled={!activeProduct.sellable}
                    onClick={() => open({ type: "sale", productId: activeProduct.id })}
                  >
                    この商品が売れた
                  </button>
                  {!activeProduct.sellable ? (
                    <p className={ui.caption}>
                      検品で「販売できる」と登録すると売上を記録できます。
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </Modal>
      ) : null}
    </main>
  );
}
