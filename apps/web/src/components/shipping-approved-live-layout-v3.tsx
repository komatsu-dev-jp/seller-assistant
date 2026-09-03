"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import type { ShippingApprovedStage } from "../lib/shipping-approved-stage";
import mobileStyles from "./approved-mobile/approved-mobile-demo.module.css";
import { getMobileScreen, type MobileScreen } from "./approved-mobile/mobile-screen-data";
import { PcCanvas } from "./approved-pc/pc-canvas";
import pcStyles from "./approved-pc/approved-pc-middle-screens.module.css";
import { PcUiGlyph, pcNavGlyphs } from "./approved-pc/pc-ui-glyph";
import liveStyles from "./shipping-approved-live-layout.module.css";

export type ShippingPhotoState = "missing" | "ready" | "confirmed";
export type ShippingPolicyMode = "high_value_only" | "all" | "disabled";
export type ShippingField =
  | "salesChannel"
  | "transactionId"
  | "buyerDisplayName"
  | "saleAmount"
  | "inventoryNumber"
  | "locationCode"
  | "shippingOccurredAt";

export type ShippingMethodOption = {
  id: string;
  label: string;
  feeLabel: string;
  pcFeeLabel?: string;
  estimate?: string;
};

export type ShippingApprovedLiveLayoutProps = {
  stage: ShippingApprovedStage;
  orderNumber?: string | undefined;
  productTitle?: string | undefined;
  salesChannel?: string | undefined;
  transactionId?: string | undefined;
  buyerDisplayName?: string | undefined;
  saleAmount?: string | undefined;
  saleAmountReadOnly?: boolean | undefined;
  missingInformationCount?: number | undefined;
  inventoryNumber?: string | undefined;
  locationCode?: string | undefined;
  locationPhotoUrl?: string | undefined;
  inventoryConfirmed?: boolean | undefined;
  locationConfirmed?: boolean | undefined;
  inventoryConfirmedAt?: string | undefined;
  locationConfirmedAt?: string | undefined;
  pickMatched?: boolean | undefined;
  policyMode?: ShippingPolicyMode | undefined;
  policyThreshold?: string | undefined;
  canManagePolicy?: boolean | undefined;
  productPhotoState?: ShippingPhotoState | undefined;
  packedPhotoState?: ShippingPhotoState | undefined;
  productPhotoUrl?: string | undefined;
  packedPhotoUrl?: string | undefined;
  photoConfirmed?: boolean | undefined;
  photoStatusLabel?: string | undefined;
  packingConfirmed?: boolean | undefined;
  shippingMethods?: readonly ShippingMethodOption[] | undefined;
  selectedShippingMethodId?: string | undefined;
  shippingMethod?: string | undefined;
  shippingFee?: string | undefined;
  pcShippingFee?: string | undefined;
  officialCheckedDate?: string | undefined;
  reviewConfirmedAt?: string | undefined;
  shippingOccurredAt?: string | undefined;
  assignmentLabel?: string | undefined;
  notice?: ReactNode;
  error?: ReactNode;
  retryControl?: ReactNode;
  pickVerificationControl?: ReactNode;
  productPhotoControl?: ReactNode;
  packedPhotoControl?: ReactNode;
  photoConfirmationControl?: ReactNode;
  packingConfirmationControl?: ReactNode;
  packingChecklistControl?: ReactNode;
  catalogDialogControl?: ReactNode;
  policySaveControl?: ReactNode;
  photoDecisionControl?: ReactNode;
  addressControl?: ReactNode;
  orderContextControl?: ReactNode;
  orderCreationControl?: ReactNode;
  busy?: boolean | undefined;
  primaryDisabled?: boolean | undefined;
  primaryLabel?: string | undefined;
  catalogDialogOpen?: boolean | undefined;
  onFieldChange?: ((field: ShippingField, value: string) => void) | undefined;
  onPolicyModeChange?: ((mode: ShippingPolicyMode) => void) | undefined;
  onShippingMethodChange?: ((methodId: string) => void) | undefined;
  onPrimary?: (() => void) | undefined;
  onSecondary?: (() => void) | undefined;
  onReviewOrderInfo?: (() => void) | undefined;
  onSkipPhotos?: (() => void) | undefined;
  onContinue?: (() => void) | undefined;
  onEditShippingCatalog?: (() => void) | undefined;
  onCloseShippingCatalog?: (() => void) | undefined;
  onCheckOfficialFee?: (() => void) | undefined;
};

const nav = ["ホーム", "作業", "仕入れ", "商品", "注文・発送", "在庫", "会計", "メンバー", "設定"];
const pcNames: Record<29 | 30 | 31 | 32, string> = {
  29: "注文を記録",
  30: "商品を取り出す",
  31: "発送前の写真",
  32: "配送方法と発送",
};
const pcRoutes = [
  "/",
  "/workflow",
  "/workflow",
  "/workflow",
  "/shipping",
  "/inventory",
  "/accounting",
  "/team",
  "/",
];

function cn(...names: Array<string | false | undefined>): string {
  return names.filter(Boolean).join(" ");
}

function valueOrMissing(value?: string): string {
  return value?.trim() || "未入力";
}

function shippingDatePart(value?: string): string {
  if (!value) return "";
  const isoDate = value.match(/^\d{4}-\d{2}-\d{2}/u)?.[0];
  if (isoDate) return isoDate;
  return value.match(/^\d{4}\/\d{2}\/\d{2}/u)?.[0]?.replaceAll("/", "-") ?? "";
}

function withShippingDate(current: string | undefined, date: string): string {
  if (!date) return "";
  const time = current?.match(/T(\d{2}:\d{2})/u)?.[1] ?? "12:00";
  return `${date}T${time}`;
}

function photoLabel(state?: ShippingPhotoState): string {
  if (state === "confirmed") return "確認済み";
  if (state === "ready") return "撮影済み";
  return "未撮影";
}

export function ShippingApprovedLiveLayout(props: ShippingApprovedLiveLayoutProps) {
  const [packingChecks, setPackingChecks] = useState<boolean[]>(() =>
    Array.from({ length: 6 }, () => false),
  );
  const [pcSafetyOpen, setPcSafetyOpen] = useState(false);
  const pcSafetyReturnFocusRef = useRef<HTMLElement | null>(null);
  const catalogReturnFocusRef = useRef<HTMLElement | null>(null);
  const openPcSafety = () => {
    pcSafetyReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPcSafetyOpen(true);
  };
  const closePcSafety = () => {
    const returnFocus = pcSafetyReturnFocusRef.current;
    setPcSafetyOpen(false);
    window.requestAnimationFrame(() => {
      if (returnFocus?.isConnected) returnFocus.focus();
    });
  };
  const openShippingCatalog = () => {
    catalogReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    props.onEditShippingCatalog?.();
  };
  const closeShippingCatalog = () => {
    const returnFocus = catalogReturnFocusRef.current;
    props.onCloseShippingCatalog?.();
    window.requestAnimationFrame(() => {
      if (returnFocus?.isConnected) returnFocus.focus();
    });
  };
  const pcSafetySignal = Boolean(props.error || props.retryControl);
  useEffect(() => {
    if (
      props.stage === "photo_and_pack" &&
      pcSafetySignal &&
      window.matchMedia("(min-width: 768px)").matches
    ) {
      setPcSafetyOpen(true);
    }
  }, [pcSafetySignal, props.stage]);
  const requiredPackingChecksComplete =
    props.packingConfirmed || packingChecks.slice(0, 5).every(Boolean);
  const packingChecklistControl = (
    <PackingChecklist
      checks={packingChecks}
      confirmed={props.packingConfirmed === true}
      busy={props.busy === true}
      onChange={(index, checked) =>
        setPackingChecks((current) =>
          current.map((value, row) => (row === index ? checked : value)),
        )
      }
    />
  );
  const packingConfirmationControl = requiredPackingChecksComplete ? (
    props.packingConfirmationControl
  ) : (
    <button type="button" className={liveStyles.controlButton} disabled>
      必須5項目を確認すると梱包を記録できます
    </button>
  );
  const resolvedProps = {
    ...props,
    packingChecklistControl,
    packingConfirmationControl,
    onEditShippingCatalog: openShippingCatalog,
    onCloseShippingCatalog: closeShippingCatalog,
  };
  const pcSafetyRequired = props.stage === "photo_and_pack" && pcSafetyOpen;
  return (
    <div className={liveStyles.page} data-approved-live-shipping="v3">
      <div
        aria-hidden={props.catalogDialogOpen || pcSafetyRequired || undefined}
        inert={props.catalogDialogOpen || pcSafetyRequired || undefined}
      >
        <LiveMobileShipping {...resolvedProps} />
        <LivePcShipping {...resolvedProps} onOpenSafety={openPcSafety} />
      </div>
      {pcSafetyRequired ? (
        <PcShippingSafetyDialog {...resolvedProps} onClose={closePcSafety} />
      ) : null}
      {props.catalogDialogOpen ? (
        <ShippingCatalogDialog onClose={closeShippingCatalog}>
          {props.catalogDialogControl}
        </ShippingCatalogDialog>
      ) : null}
    </div>
  );
}

function LiveMobileShipping(props: ShippingApprovedLiveLayoutProps) {
  const screenId = mobileScreenId(props.stage);
  const screen = getMobileScreen(screenId) ?? null;
  const supplementalPhoto = props.stage === "photo_and_pack";
  const verificationRequired = props.stage === "pick" && !props.pickMatched;
  const operationalOverlay = supplementalPhoto || verificationRequired;
  const title = screen?.title ?? "商品を取り出す";
  return (
    <main className={cn(mobileStyles.page, liveStyles.mobile)} aria-label={`モバイル ${title}`}>
      <div className={mobileStyles.phoneShell}>
        <LiveMobileHeader title={title} onBack={props.onSecondary} />
        <div
          className={mobileStyles.scrollArea}
          aria-hidden={operationalOverlay || undefined}
          inert={operationalOverlay || undefined}
        >
          <MobileMessages
            notice={props.notice}
            error={props.error}
            retryControl={props.retryControl}
          />
          {screen ? <MobileApprovedContent screen={screen} {...props} /> : null}
          <LiveMobileActionBar screen={screen} {...props} />
        </div>
        <LiveMobileFooter inert={operationalOverlay} />
        {verificationRequired ? (
          <MobileOperationalOverlay id="mobile-pick-verification-title" title="商品と棚を確認">
            <p>商品ラベルと棚ラベルを読み取り、同じ商品か確認してください。</p>
            {props.pickVerificationControl}
          </MobileOperationalOverlay>
        ) : null}
        {supplementalPhoto ? (
          <MobileOperationalOverlay id="mobile-photo-safety-title" title="発送前の写真（追加確認）">
            <p>注文・発送34〜38とは別の、安全のための追加確認です。</p>
            <MobileShippingPhotoContent {...props} />
          </MobileOperationalOverlay>
        ) : null}
      </div>
    </main>
  );
}

function mobileScreenId(stage: ShippingApprovedStage): "34" | "35" | "36" | "37" | "38" {
  if (stage === "order") return "34";
  if (stage === "pick") return "35";
  if (stage === "photo_and_pack") return "35";
  if (stage === "method") return "36";
  if (stage === "review") return "37";
  return "38";
}

function LiveMobileHeader({ title, onBack }: { title: string; onBack?: (() => void) | undefined }) {
  return (
    <header className={mobileStyles.header}>
      <button
        className={cn(mobileStyles.backButton, liveStyles.iconButtonReset)}
        type="button"
        aria-label="前の画面へ"
        onClick={onBack}
      >
        ‹
      </button>
      <h1 className={mobileStyles.headerTitle}>{title}</h1>
      <svg className={mobileStyles.bellIcon} viewBox="0 0 24 24" role="img" aria-label="通知">
        <title>通知</title>
        <path d="M6.5 9.5a5.5 5.5 0 0 1 11 0v4l1.7 2.1H4.8l1.7-2.1v-4Z" />
        <path d="M9.5 18.1a2.8 2.8 0 0 0 5 0" />
      </svg>
    </header>
  );
}

function MobileMessages({
  notice,
  error,
  retryControl,
}: Pick<ShippingApprovedLiveLayoutProps, "notice" | "error" | "retryControl">) {
  if (!notice && !error && !retryControl) return null;
  return (
    <>
      {notice ? (
        <div className={liveStyles.srOnly} role="status" aria-live="polite">
          {notice}
        </div>
      ) : null}
      {error || retryControl ? (
        <section className={cn(mobileStyles.contentStack, liveStyles.mobileMessages)}>
          {error ? <div className={liveStyles.error}>{error}</div> : null}
          {retryControl}
        </section>
      ) : null}
    </>
  );
}

function MobileApprovedContent({
  screen,
  ...props
}: { screen: MobileScreen } & ShippingApprovedLiveLayoutProps) {
  if (screen.id === "34") return <MobileOrder {...props} />;
  if (screen.id === "35") return <MobilePick {...props} />;
  if (screen.id === "36") return <MobileMethod {...props} />;
  if (screen.id === "37") return <MobileReview {...props} />;
  return <MobileComplete {...props} />;
}

function MobileOrder(props: ShippingApprovedLiveLayoutProps) {
  return (
    <section className={mobileStyles.contentStack}>
      <p className={mobileStyles.boardInstruction}>必要な情報を入力してください</p>
      <div className={mobileStyles.orderFormCard}>
        <MobileField
          className={liveStyles.orderNumberField}
          label="アプリ内注文番号（自動生成／変更不可）"
          value={props.orderNumber ?? "保存時に自動生成"}
          readOnly
        />
        {props.orderContextControl}
        {props.orderCreationControl}
        <div className={cn(mobileStyles.formField, mobileStyles.salesChannelField)}>
          <span>販売先</span>
          <div className={mobileStyles.salesChannelControl}>
            <select
              aria-label="販売先"
              value={props.salesChannel ?? ""}
              onChange={(event) => props.onFieldChange?.("salesChannel", event.target.value)}
            >
              <option value="">選択してください</option>
              <option value="メルカリ">メルカリ</option>
              <option value="Yahoo!フリマ">Yahoo!フリマ</option>
              <option value="Yahoo!オークション">Yahoo!オークション</option>
            </select>
            <span aria-hidden="true">⌄</span>
          </div>
        </div>
        <MobileField
          label="販売先の取引ID"
          value={props.transactionId}
          placeholder="例）TX-260826-012"
          onChange={(value) => props.onFieldChange?.("transactionId", value)}
        />
        <MobileField
          label="購入者表示名（任意）"
          value={props.buyerDisplayName}
          placeholder="例）たろう"
          onChange={(value) => props.onFieldChange?.("buyerDisplayName", value)}
        />
        {props.orderCreationControl ? (
          <MobileField
            label="販売金額（任意・あとで入力できます）"
            value={props.saleAmount}
            placeholder="未入力"
            onChange={(value) => props.onFieldChange?.("saleAmount", value)}
          />
        ) : null}
        <small className={mobileStyles.fieldHint}>匿名配送なら住所は保存しません</small>
      </div>
    </section>
  );
}

function MobilePick(props: ShippingApprovedLiveLayoutProps) {
  return (
    <section className={mobileStyles.contentStack}>
      <p className={mobileStyles.boardInstruction}>手順にそって取り出してください</p>
      <div className={mobileStyles.pickupChecklist}>
        <div className={cn(mobileStyles.pickupChecklistRow, liveStyles.pickupChecklistRowLive)}>
          <CheckMark tone={props.inventoryConfirmed ? "green" : "amber"} />
          <div>
            <strong>{props.inventoryConfirmed ? "商品を確認済み" : "商品を確認"}</strong>
            <small>商品コード・数量を確認しました</small>
          </div>
          {props.inventoryConfirmedAt ? (
            <time className={liveStyles.verificationTime}>{props.inventoryConfirmedAt}</time>
          ) : null}
        </div>
        <div className={cn(mobileStyles.pickupChecklistRow, liveStyles.pickupChecklistRowLive)}>
          <CheckMark tone={props.locationConfirmed ? "green" : "amber"} />
          <div>
            <strong>{props.locationConfirmed ? "棚を確認済み" : "棚を確認"}</strong>
            <small>
              {props.locationConfirmed
                ? `${props.locationCode ?? "保管場所"}を確認しました`
                : "保管場所を確認します"}
            </small>
          </div>
          {props.locationConfirmedAt ? (
            <time className={liveStyles.verificationTime}>{props.locationConfirmedAt}</time>
          ) : null}
        </div>
      </div>
      <div className={mobileStyles.pickupShelfPhoto}>
        <strong>保管場所の写真</strong>
        <div className={mobileStyles.pickupShelfImageWrap}>
          {props.locationPhotoUrl ? (
            <>
              <img
                src={props.locationPhotoUrl}
                alt="注文商品の保管場所"
                className={mobileStyles.pickupShelfAsset}
              />
              <span>{valueOrMissing(props.locationCode)}</span>
            </>
          ) : (
            <div
              className={cn(mobileStyles.pickupShelfAsset, liveStyles.photoPlaceholder)}
              role="img"
              aria-label="保管場所の写真は未設定"
            >
              保管場所の写真は未設定
            </div>
          )}
        </div>
      </div>
      <div className={mobileStyles.pickupCheck}>
        <CheckMark tone={props.pickMatched ? "green" : "amber"} />
        <div>
          <strong>{props.pickMatched ? "商品と棚が一致しました" : "商品と棚を照合します"}</strong>
          <small>{props.pickMatched ? "一致" : "未確認"}</small>
        </div>
      </div>
    </section>
  );
}

function MobileMethod(props: ShippingApprovedLiveLayoutProps) {
  const methods = props.shippingMethods ?? [];
  return (
    <section className={mobileStyles.contentStack}>
      <div className={mobileStyles.salesChannelChip}>
        {valueOrMissing(props.salesChannel)}で使える方法を選んでください
      </div>
      <div className={mobileStyles.shippingOptions}>
        {methods.length > 0 ? (
          methods.map((method) => (
            <ShippingMethodRow
              key={method.id}
              label={method.label}
              fee={method.feeLabel}
              active={props.selectedShippingMethodId === method.id}
              onClick={() => props.onShippingMethodChange?.(method.id)}
            />
          ))
        ) : (
          <div className={liveStyles.emptyCatalog}>
            送料一覧が未設定です。人が設定してから選びます。
          </div>
        )}
      </div>
      <button
        type="button"
        className={mobileStyles.textAction}
        onClick={props.onEditShippingCatalog}
      >
        ほかのサイズを見る{"\u3000"}›
      </button>
      <div className={mobileStyles.officialDate}>
        <svg className={mobileStyles.officialCheckIcon} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.8 19 5.6v5.2c0 4.7-2.8 8.1-7 10.4-4.2-2.3-7-5.7-7-10.4V5.6L12 2.8Z" />
          <path d="m8.7 11.8 2.1 2.1 4.6-5" />
        </svg>
        <strong>
          公式確認{"\u3000"}
          {valueOrMissing(props.officialCheckedDate)}
        </strong>
      </div>
    </section>
  );
}

function MobileReview(props: ShippingApprovedLiveLayoutProps) {
  return (
    <section className={mobileStyles.contentStack}>
      <p className={mobileStyles.boardInstruction}>内容を確認してください</p>
      <div className={cn(mobileStyles.summaryRows, mobileStyles.shippingReviewRows)}>
        <DataRow label="商品" value={valueOrMissing(props.productTitle)} />
        <DataRow label="販売先" value={valueOrMissing(props.salesChannel)} />
        <DataRow label="取引ID" value={valueOrMissing(props.transactionId)} />
        <DataRow label="配送方法" value={valueOrMissing(props.shippingMethod)} />
        <DataRow label="送料" value={valueOrMissing(props.shippingFee)} />
      </div>
      <button
        type="button"
        className={mobileStyles.outlineButton}
        onClick={props.onCheckOfficialFee}
      >
        公式料金を確認
      </button>
      <div className={cn(mobileStyles.warningBanner, liveStyles.mobileFeeWarning)}>
        <span aria-hidden="true">⚠</span>
        料金は変わることがあります
      </div>
    </section>
  );
}

function MobileComplete(props: ShippingApprovedLiveLayoutProps) {
  const completed = props.stage === "complete";
  return (
    <section className={mobileStyles.contentStack}>
      <p className={mobileStyles.boardInstruction}>内容を記録してください</p>
      <div className={cn(mobileStyles.confirmRow, mobileStyles.shipConfirm)}>
        <CheckMark tone="green" />
        <div>
          <strong>確認済み</strong>
          <small>記録日時：{valueOrMissing(props.reviewConfirmedAt)}</small>
        </div>
      </div>
      <div className={mobileStyles.shippingDetailsCard}>
        <DataRow label="配送方法" value={valueOrMissing(props.shippingMethod)} />
        <DataRow label="送料" value={valueOrMissing(props.shippingFee)} />
        <DataRow
          label="発送日時"
          value={
            completed ? (
              valueOrMissing(props.shippingOccurredAt)
            ) : (
              <input
                className={liveStyles.mobileDateInput}
                type="datetime-local"
                aria-label="発送日時"
                value={props.shippingOccurredAt ?? ""}
                onChange={(event) =>
                  props.onFieldChange?.("shippingOccurredAt", event.target.value)
                }
              />
            )
          }
        />
        <DataRow label="担当" value={props.assignmentLabel ?? "本人"} />
      </div>
      <div className={mobileStyles.settingsCard}>
        <strong>⚙ 送料一覧</strong>
        <small>
          メルカリ / Yahoo!フリマ・オークション
          <br />
          公式確認日つき
        </small>
        <button type="button" onClick={props.onEditShippingCatalog}>
          送料一覧を編集{"\u3000"}›
        </button>
      </div>
    </section>
  );
}

function MobileShippingPhotoContent(props: ShippingApprovedLiveLayoutProps) {
  return (
    <section className={mobileStyles.contentStack} data-additional-live-screen="shipping-photo">
      <p className={mobileStyles.boardInstruction}>写真と梱包内容を人が確認してください</p>
      <div className={mobileStyles.methodCards} aria-label="現在の発送前写真の設定">
        <ChoiceCard
          label="高額商品だけ撮る（おすすめ）"
          detail={
            props.canManagePolicy
              ? props.policyThreshold
                ? `高額の目安 ${props.policyThreshold}`
                : "目安額は未設定"
              : "目安額は管理者のみ確認できます"
          }
          active={props.policyMode === "high_value_only"}
          onClick={() => props.onPolicyModeChange?.("high_value_only")}
          disabled={!props.canManagePolicy}
        />
        <ChoiceCard
          label="すべて撮る"
          detail="すべての注文で確認します"
          active={props.policyMode === "all"}
          onClick={() => props.onPolicyModeChange?.("all")}
          disabled={!props.canManagePolicy}
        />
        <ChoiceCard
          label="使わない"
          detail="写真を使わずに進めます"
          active={props.policyMode === "disabled"}
          onClick={() => props.onPolicyModeChange?.("disabled")}
          disabled={!props.canManagePolicy}
        />
      </div>
      {props.canManagePolicy ? props.policySaveControl : null}
      {!props.canManagePolicy ? (
        <p className={liveStyles.policyReadOnly}>
          {props.policyMode
            ? "この注文に適用された写真ルールを表示しています。変更は管理者が行います。"
            : "設定内容は管理者だけが確認できます。写真要否は、この注文の安全確認に従ってください。"}
        </p>
      ) : null}
      {props.photoDecisionControl}
      {props.onSkipPhotos ? (
        <button
          type="button"
          className={liveStyles.controlButtonSecondary}
          disabled={props.busy}
          onClick={props.onSkipPhotos}
        >
          今回は写真を使わない
        </button>
      ) : null}
      <div className={liveStyles.mobilePhotoCards}>
        <LivePhotoCard title="商品写真" state={props.productPhotoState} url={props.productPhotoUrl}>
          {props.productPhotoControl}
        </LivePhotoCard>
        <LivePhotoCard title="梱包後写真" state={props.packedPhotoState} url={props.packedPhotoUrl}>
          {props.packedPhotoControl}
        </LivePhotoCard>
      </div>
      {props.photoConfirmationControl}
      {props.packingChecklistControl}
      {props.packingConfirmationControl}
      <div className={mobileStyles.infoBanner}>
        写真だけで発送を確定しません。外部へ自動送信しません。
      </div>
    </section>
  );
}

function LiveMobileActionBar({
  screen,
  ...props
}: { screen: MobileScreen | null } & ShippingApprovedLiveLayoutProps) {
  const label = props.primaryLabel ?? screen?.primary ?? "確認して次へ";
  return (
    <div className={mobileStyles.actionBar}>
      <button
        type="button"
        className={cn(mobileStyles.primaryButton, liveStyles.actionButton)}
        disabled={props.busy || props.primaryDisabled}
        onClick={props.onPrimary}
      >
        {label}
      </button>
      {props.onContinue ? (
        <button
          type="button"
          className={cn(mobileStyles.secondaryAction, liveStyles.actionButton)}
          onClick={props.onContinue}
        >
          作業を続ける <span>›</span>
        </button>
      ) : (
        <a className={mobileStyles.secondaryAction} href="/workflow">
          作業を続ける <span>›</span>
        </a>
      )}
    </div>
  );
}

function LiveMobileFooter({ inert = false }: { inert?: boolean }) {
  const items = [
    ["home", "ホーム", "/mobile"],
    ["work", "作業", "/workflow"],
    ["product", "商品", "/workflow"],
    ["inventory", "在庫", "/inventory"],
    ["accounting", "会計", "/accounting"],
  ] as const;
  return (
    <nav
      className={mobileStyles.footer}
      aria-label="モバイルナビゲーション"
      aria-hidden={inert || undefined}
      inert={inert || undefined}
    >
      {items.map(([kind, label, href]) => (
        <a
          className={kind === "work" ? mobileStyles.footerActive : undefined}
          href={href}
          key={kind}
        >
          <span>
            <FooterIcon kind={kind} />
          </span>
          {label}
        </a>
      ))}
    </nav>
  );
}

function MobileOperationalOverlay({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  const { dialogRef, onKeyDown } = useDialogFocus();
  return (
    <section
      ref={dialogRef}
      className={liveStyles.mobileOperationalOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby={id}
      data-additional-live-screen="shipping-safety-step"
      onKeyDown={onKeyDown}
    >
      <header>
        <span>追加の安全確認</span>
        <h2 id={id} tabIndex={-1} data-dialog-start>
          {title}
        </h2>
      </header>
      {children}
    </section>
  );
}

function useDialogFocus() {
  const dialogRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>("[data-dialog-start]")?.focus();
    return () => previouslyFocused?.focus();
  }, []);

  function onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((entry) => entry.offsetParent !== null);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return { dialogRef, onKeyDown };
}

function ShippingCatalogDialog({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose?: (() => void) | undefined;
}) {
  const { dialogRef, onKeyDown } = useDialogFocus();
  return (
    <section
      ref={dialogRef}
      className={liveStyles.catalogDialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shipping-catalog-dialog-title"
      onKeyDown={(event) => {
        if (event.key === "Escape" && onClose) {
          event.preventDefault();
          onClose();
          return;
        }
        onKeyDown(event);
      }}
    >
      <header>
        <div>
          <span>配送料金は人が確認して登録します</span>
          <h2 id="shipping-catalog-dialog-title" tabIndex={-1} data-dialog-start>
            送料一覧
          </h2>
        </div>
        <button type="button" onClick={onClose} aria-label="送料一覧を閉じる">
          閉じる
        </button>
      </header>
      {children}
    </section>
  );
}

function FooterIcon({ kind }: { kind: "home" | "work" | "product" | "inventory" | "accounting" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {kind === "home" ? <path d="m3.5 10 8.5-7 8.5 7v9.5H15v-5H9v5H3.5z" /> : null}
      {kind === "work" ? (
        <>
          <path d="m4 16 10.8-10.8 4 4L8 20H4z" />
          <path d="m13.5 6.5 4 4M4 20h5" />
        </>
      ) : null}
      {kind === "product" ? (
        <>
          <path d="M4 6h7l2 2h7v11H4z" />
          <path d="M4 6v12M11 6v2" />
        </>
      ) : null}
      {kind === "inventory" ? (
        <>
          <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </>
      ) : null}
      {kind === "accounting" ? (
        <>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M8 8h7M8 12h5M8 16h8" />
          <path d="M16 7.5v9" />
        </>
      ) : null}
    </svg>
  );
}

function CheckMark({ tone = "blue" }: { tone?: "blue" | "green" | "amber" }) {
  return <span className={cn(mobileStyles.checkMark, mobileStyles[`check${tone}`])}>✓</span>;
}

function ChoiceCard({
  label,
  detail,
  active,
  onClick,
  tone = "blue",
  disabled = false,
  indicator = "check",
}: {
  label: string;
  detail: string;
  active: boolean;
  onClick: () => void;
  tone?: "blue" | "green" | "amber";
  disabled?: boolean;
  indicator?: "check" | "radio";
}) {
  return (
    <button
      type="button"
      className={cn(
        mobileStyles.choiceCard,
        active && mobileStyles.choiceCardActive,
        active && mobileStyles[`choice${tone}`],
      )}
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
    >
      <span
        className={cn(
          mobileStyles.choiceRadio,
          indicator === "radio" && mobileStyles.choiceRadioDot,
        )}
      >
        {active && indicator === "check" ? "✓" : ""}
      </span>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <span className={mobileStyles.chevron}>›</span>
    </button>
  );
}

function ShippingMethodRow({
  label,
  fee,
  active,
  onClick,
}: {
  label: string;
  fee: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(mobileStyles.shippingMethodRow, active && mobileStyles.shippingMethodRowActive)}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className={mobileStyles.shippingMethodRadio} aria-hidden="true" />
      <strong>{label}</strong>
      <b>{fee}</b>
    </button>
  );
}

function DataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={mobileStyles.dataRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MobileField({
  className,
  label,
  value,
  placeholder,
  readOnly = false,
  onChange,
}: {
  className?: string | undefined;
  label: string;
  value?: string | undefined;
  placeholder?: string | undefined;
  readOnly?: boolean | undefined;
  onChange?: ((value: string) => void) | undefined;
}) {
  return (
    <label className={cn(mobileStyles.formField, className)}>
      <span>{label}</span>
      <input
        value={value ?? ""}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={(event) => onChange?.(event.target.value)}
      />
    </label>
  );
}

function LivePhotoCard({
  title,
  state,
  url,
  children,
}: {
  title: string;
  state?: ShippingPhotoState | undefined;
  url?: string | undefined;
  children?: ReactNode | undefined;
}) {
  return (
    <section className={liveStyles.photoCard}>
      <div>
        <strong>{title}</strong>
        <span>{photoLabel(state)}</span>
      </div>
      {url ? <img src={url} alt={title} /> : null}
      {children}
    </section>
  );
}

function LivePcShipping(props: ShippingApprovedLiveLayoutProps & { onOpenSafety: () => void }) {
  const screen = pcScreenNumber(props.stage);
  const verificationRequired = props.stage === "pick" && !props.pickMatched;
  return (
    <main className={liveStyles.pc} aria-label={`PC ${screen} ${pcNames[screen]}`}>
      <div
        aria-hidden={verificationRequired || undefined}
        inert={verificationRequired || undefined}
      >
        <LivePcShell n={screen} assignmentLabel={props.assignmentLabel}>
          {props.notice ? (
            <div className={liveStyles.srOnly} role="status" aria-live="polite">
              {props.notice}
            </div>
          ) : null}
          {screen !== 31 && (props.error || props.retryControl) ? (
            <div className={liveStyles.pcMessages}>
              {props.error ? <div className={liveStyles.error}>{props.error}</div> : null}
              {props.retryControl}
            </div>
          ) : null}
          {screen === 29 ? <PcOrder {...props} /> : null}
          {screen === 30 ? <PcPick {...props} /> : null}
          {screen === 31 ? <PcPack {...props} /> : null}
          {screen === 32 ? <PcShip {...props} /> : null}
        </LivePcShell>
      </div>
      {verificationRequired ? (
        <PcOperationalOverlay id="pc-pick-verification-title" title="商品と棚を確認">
          <p>商品ラベルと棚ラベルを読み取り、同じ商品か確認してください。</p>
          {props.pickVerificationControl}
        </PcOperationalOverlay>
      ) : null}
    </main>
  );
}

function PcOperationalOverlay({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  const { dialogRef, onKeyDown } = useDialogFocus();
  return (
    <section
      ref={dialogRef}
      className={liveStyles.pcOperationalOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby={id}
      data-additional-live-screen="pick-verification"
      onKeyDown={onKeyDown}
    >
      <span>追加の安全確認</span>
      <h2 id={id} tabIndex={-1} data-dialog-start>
        {title}
      </h2>
      {children}
    </section>
  );
}

function pcScreenNumber(stage: ShippingApprovedStage): 29 | 30 | 31 | 32 {
  if (stage === "order") return 29;
  if (stage === "pick") return 30;
  if (stage === "photo_and_pack") return 31;
  return 32;
}

function LivePcShell({
  n,
  assignmentLabel,
  children,
}: {
  n: 29 | 30 | 31 | 32;
  assignmentLabel?: string | undefined;
  children: ReactNode;
}) {
  return (
    <PcCanvas className={`${pcStyles.app} ${pcStyles.utilityApp} ${pcStyles[`screen${n}`] ?? ""}`}>
      <header className={pcStyles.utilityHeader}>
        <button type="button" aria-label="サイドバーを開く" className={pcStyles.utilitySideToggle}>
          ☰
        </button>
        <div className={pcStyles.utilityMainTools}>
          <button
            type="button"
            aria-label="作業者メニューを開く"
            className={pcStyles.utilityFrameToggle}
          >
            ☰
          </button>
          <button type="button" className={pcStyles.workerMenu}>
            作業者メニュー{"\u3000"}⌄
          </button>
          <div className={pcStyles.utilityTools}>
            <span aria-label="通知">
              <PcUiGlyph name="bell" />
            </span>
            <span aria-label="ヘルプ">
              <PcUiGlyph name="help" />
            </span>
            <span className={pcStyles.utilityUser}>
              <PcUiGlyph name="user" />
              {assignmentLabel ?? "担当A"}⌄
            </span>
          </div>
        </div>
      </header>
      <aside>
        {nav.map((label, index) => (
          <a
            className={label === "作業" ? pcStyles.active : ""}
            href={pcRoutes[index] ?? "/"}
            key={label}
          >
            <PcUiGlyph name={pcNavGlyphs[index] ?? "home"} className={pcStyles.navGlyph ?? ""} />
            {label}
          </a>
        ))}
      </aside>
      <section className={pcStyles.frame}>
        <div className={pcStyles.utilityPageHeading}>
          <b>{String(n).padStart(2, "0")}</b>
          <h1>{pcNames[n]}</h1>
          {n === 30 ? <em>担当注文</em> : null}
          {n === 31 ? <em>高額商品に該当</em> : null}
        </div>
        {children}
      </section>
    </PcCanvas>
  );
}

function PcOrder(props: ShippingApprovedLiveLayoutProps) {
  return (
    <div className={pcStyles.pad}>
      <h2>注文を記録</h2>
      <p>
        匿名配送で住所の情報が不要な場合は、住所は保存しません。{"\u3000"}
        <a href="#order-privacy">詳しく見る ⓘ</a>
      </p>
      <PcCard className={pcStyles.order ?? ""}>
        <h3>⚙ 仮注文番号 {props.orderNumber ?? "保存時に自動で付与されます"}</h3>
        {props.orderContextControl}
        {props.orderCreationControl}
        <div>
          <label>
            <span className={pcStyles.orderFieldHead}>
              <b>販売先</b>
              <span className={pcStyles.requiredChip}>必須</span>
            </span>
            <select
              value={props.salesChannel ?? ""}
              onChange={(event) => props.onFieldChange?.("salesChannel", event.target.value)}
            >
              <option value="" disabled>
                選択してください
              </option>
              <option value="メルカリ">メルカリ</option>
              <option value="Yahoo!フリマ">Yahoo!フリマ</option>
              <option value="Yahoo!オークション">Yahoo!オークション</option>
            </select>
          </label>
          <label>
            <span className={pcStyles.orderFieldHead}>
              <b>取引ID</b>
              <span className={pcStyles.laterHint}>任意・あとで入力できます</span>
            </span>
            <span className={pcStyles.orderInlineInput}>
              <input
                value={props.transactionId ?? ""}
                placeholder="取引IDを入力"
                onChange={(event) => props.onFieldChange?.("transactionId", event.target.value)}
              />
              <button type="button" onClick={() => props.onFieldChange?.("transactionId", "")}>
                あとで入力
              </button>
            </span>
          </label>
          <label>
            <span className={pcStyles.orderFieldHead}>
              <b>購入者の表示名</b>
              <span className={pcStyles.laterHint}>任意</span>
            </span>
            <input
              value={props.buyerDisplayName ?? ""}
              placeholder="表示名を入力"
              onChange={(event) => props.onFieldChange?.("buyerDisplayName", event.target.value)}
            />
          </label>
          <label>
            <span className={pcStyles.orderFieldHead}>
              <b>販売金額</b>
              <span className={pcStyles.requiredChip}>必須</span>
            </span>
            <span className={pcStyles.orderInlineInput}>
              <span className={pcStyles.moneyInput}>
                <span>¥</span>
                <input
                  inputMode="numeric"
                  value={props.saleAmount ?? ""}
                  placeholder="未入力"
                  readOnly={props.saleAmountReadOnly}
                  onChange={(event) => props.onFieldChange?.("saleAmount", event.target.value)}
                />
              </span>
              <button
                type="button"
                disabled={props.saleAmountReadOnly}
                onClick={() => props.onFieldChange?.("saleAmount", "")}
              >
                あとで確認
              </button>
            </span>
          </label>
        </div>
        <p className={pcStyles.warn}>
          ▲{"\u3000"}未入力 {props.missingInformationCount ?? 0}件・作業は続けられます
        </p>
        <PcNotice>
          <span id="order-privacy">匿名配送で住所の情報が不要な場合は、住所は保存しません。</span>
          <br />
          販売先の仕様により住所の情報が必要な場合だけ、人が確認して扱います。
        </PcNotice>
      </PcCard>
      <footer>
        <button type="button" onClick={props.onSecondary}>
          キャンセル
        </button>
        <PcPrimary {...props}>仮登録して取り出しへ</PcPrimary>
      </footer>
    </div>
  );
}

function PcPick(props: ShippingApprovedLiveLayoutProps) {
  return (
    <div className={pcStyles.pad}>
      <h2>
        商品を取り出す{"\u3000"}
        <em>担当注文</em>
      </h2>
      <p>
        {props.orderNumber ?? "担当注文 未設定"}
        {"\u3000"}配送先：一般のご購入者様
      </p>
      <div className={pcStyles.pick}>
        <PcCard>
          <h3>商品ラベル</h3>
          <LiveProductLabel {...props} />
        </PcCard>
        <PcCard>
          <h3>置き場所ラベル</h3>
          <LiveLocationLabel {...props} />
        </PcCard>
        <PcCard>
          <h3>保管場所の写真</h3>
          <LiveShelfPhoto {...props} />
        </PcCard>
      </div>
      <div className={pcStyles.pickBottom}>
        <PcCard>
          <h3>照合結果</h3>
          <b className={props.pickMatched ? pcStyles.ok : pcStyles.warn}>
            ● {props.pickMatched ? "一致しました" : "未確認"}
          </b>
          <p>商品ラベルと置き場所ラベルを確認します。</p>
        </PcCard>
        <PcNotice>
          <b>作業のポイント</b>
          <br />
          商品ラベルと置き場所ラベルを確認し、正しい商品を取り出してください。
        </PcNotice>
      </div>
      <footer>
        <button type="button" onClick={props.onSecondary}>
          中止する
        </button>
        <PcPrimary {...props}>取り出しを完了</PcPrimary>
      </footer>
    </div>
  );
}

function PcPack(props: ShippingApprovedLiveLayoutProps & { onOpenSafety: () => void }) {
  const policies: Array<[ShippingPolicyMode, string, string]> = [
    ["high_value_only", "高額商品だけ撮る（おすすめ）", "高額の注文でだけ撮影し、確認に使います。"],
    ["all", "すべて撮る", "すべての注文で撮影し、確認に使います。"],
    ["disabled", "使わない", "この機能を使わず、写真は撮りません。"],
  ];
  return (
    <div className={pcStyles.pad}>
      <h2>
        発送前の写真{"\u3000"}
        <em>高額商品に該当</em>
      </h2>
      <p>すり替え・内容違いの確認用に、発送前の状態を残します。</p>
      <h3>
        ワークフロー設定 <small>（どの注文で写真を撮るか）</small>
        <span className={pcStyles.threshold}>
          高額の目安{"\u3000"}
          <b>
            {props.canManagePolicy ? (props.policyThreshold ?? "未設定") : "管理者のみ確認できます"}
          </b>
          <button type="button" className={liveStyles.pcSafetyLink} onClick={props.onOpenSafety}>
            （設定で変更できます）
          </button>
        </span>
      </h3>
      <div className={pcStyles.packOpts} aria-label="現在の発送前写真の設定">
        {policies.map(([mode, label, detail]) => (
          <PcCard
            className={props.policyMode === mode ? (pcStyles.selected ?? "") : ""}
            onClick={props.onOpenSafety}
            key={mode}
          >
            <b>
              {props.policyMode === mode ? "◉" : "○"}
              {"\u3000"}
              {label}
            </b>
            <p>{detail}</p>
          </PcCard>
        ))}
      </div>
      <div className={pcStyles.packBottom}>
        <PcCard>
          <h3>商品写真</h3>
          <PcShippingPhoto
            title="商品写真"
            url={props.productPhotoUrl}
            state={props.productPhotoState}
            kind="product"
          />
          <button type="button" className={liveStyles.pcPhotoAction} onClick={props.onOpenSafety}>
            ▣ {props.productPhotoState === "missing" ? "写真を追加" : "再撮影"}
          </button>
        </PcCard>
        <PcCard>
          <h3>梱包写真</h3>
          <PcShippingPhoto
            title="梱包写真"
            url={props.packedPhotoUrl}
            state={props.packedPhotoState}
            kind="packed"
          />
          <button type="button" className={liveStyles.pcPhotoAction} onClick={props.onOpenSafety}>
            ▣ {props.packedPhotoState === "missing" ? "写真を追加" : "再撮影"}
          </button>
        </PcCard>
        <PcCard>
          <h3>確認チェックリスト（人の目で確認）</h3>
          {props.packingChecklistControl}
        </PcCard>
      </div>
      <PcNotice>金額が未入力でも、梱包を止めずに進めます。</PcNotice>
      <p className={pcStyles.privacyNote}>
        ▣{"\u3000"}写真はPC内で非公開に保存。外部へ自動送信しません。
      </p>
      <footer>
        <button type="button" disabled={props.busy} onClick={props.onOpenSafety}>
          今回は使わない
        </button>
        <button
          className={pcStyles.primary}
          type="button"
          disabled={props.busy}
          onClick={props.onOpenSafety}
        >
          この写真を使う{"\u3000"}›
        </button>
      </footer>
    </div>
  );
}

function PcShippingSafetyDialog({
  onClose,
  ...props
}: ShippingApprovedLiveLayoutProps & { onClose: () => void }) {
  const policies: Array<[ShippingPolicyMode, string, string]> = [
    ["high_value_only", "高額商品だけ撮る（おすすめ）", "高額の注文でだけ撮影し、確認に使います。"],
    ["all", "すべて撮る", "すべての注文で撮影し、確認に使います。"],
    ["disabled", "使わない", "この機能を使わず、写真は撮りません。"],
  ];
  const { dialogRef, onKeyDown } = useDialogFocus();
  return (
    <section
      ref={dialogRef}
      className={liveStyles.pcSafetyDialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pc-shipping-safety-title"
      data-additional-live-screen="shipping-photo-safety"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
          return;
        }
        onKeyDown(event);
      }}
    >
      <header>
        <div>
          <span>追加の安全確認</span>
          <h2 id="pc-shipping-safety-title" tabIndex={-1} data-dialog-start>
            発送前の写真を確認
          </h2>
        </div>
        <button type="button" onClick={onClose} aria-label="追加の安全確認を閉じる">
          閉じる
        </button>
      </header>
      {props.error ? <div className={liveStyles.error}>{props.error}</div> : null}
      {props.notice ? <div className={liveStyles.notice}>{props.notice}</div> : null}
      {props.retryControl}
      <section className={liveStyles.safetySection}>
        <h3>今回の写真の扱い</h3>
        <p>現在の設定を確認してから、今回使うか使わないかを人が決めます。</p>
        {props.photoDecisionControl}
        {props.onSkipPhotos ? (
          <button
            type="button"
            className={liveStyles.controlButtonSecondary}
            disabled={props.busy}
            onClick={props.onSkipPhotos}
          >
            今回は写真を使わない
          </button>
        ) : null}
      </section>
      <section className={liveStyles.safetySection}>
        <h3>写真の設定</h3>
        <div className={liveStyles.safetyPolicyOptions} aria-label="発送前写真の設定">
          {policies.map(([mode, label, detail]) => (
            <button
              type="button"
              className={props.policyMode === mode ? liveStyles.safetyPolicySelected : undefined}
              disabled={!props.canManagePolicy || props.busy}
              aria-pressed={props.policyMode === mode}
              onClick={() => props.onPolicyModeChange?.(mode)}
              key={mode}
            >
              <strong>
                {props.policyMode === mode ? "◉" : "○"} {label}
              </strong>
              <small>{detail}</small>
            </button>
          ))}
        </div>
        {props.canManagePolicy ? props.policySaveControl : null}
        {!props.canManagePolicy ? (
          <p className={liveStyles.policyReadOnly}>
            この注文に適用された写真ルールを表示しています。変更は管理者が行います。
          </p>
        ) : null}
      </section>
      <section className={liveStyles.safetySection}>
        <h3>写真と梱包の人による確認</h3>
        <div className={liveStyles.safetyPhotoControls}>
          <div>
            <strong>商品写真（{photoLabel(props.productPhotoState)}）</strong>
            {props.productPhotoControl}
          </div>
          <div>
            <strong>梱包写真（{photoLabel(props.packedPhotoState)}）</strong>
            {props.packedPhotoControl}
          </div>
        </div>
        {props.photoConfirmationControl}
        {props.packingChecklistControl}
        {props.packingConfirmationControl}
      </section>
    </section>
  );
}

function PcShip(props: ShippingApprovedLiveLayoutProps) {
  const methods = props.shippingMethods ?? [];
  const selectedMethod = methods.find((method) => method.id === props.selectedShippingMethodId);
  const visibleMethods = selectedMethod
    ? [selectedMethod, ...methods.filter((method) => method.id !== selectedMethod.id)].slice(0, 3)
    : methods.slice(0, 3);
  return (
    <div className={pcStyles.pad}>
      <h2>配送方法と発送</h2>
      <p>
        {props.orderNumber ?? "担当注文 未設定"}
        {"\u3000"} 販売先：
        {valueOrMissing(props.salesChannel)}
        {"\u3000"}｜{"\u3000"}配送先：一般のご購入者様
      </p>
      <p className={pcStyles.shipDone}>
        ● 発送前の写真{"\u3000"}
        {props.photoStatusLabel ?? (props.photoConfirmed ? "確認済み" : "要確認")}
      </p>
      <div className={pcStyles.ship}>
        <PcCard>
          <h3>
            お届け先（販売先の設定に基づく） <em className={pcStyles.domesticChip}>国内向け</em>
          </h3>
          <p>
            <b>利用する配送方法</b>
          </p>
          {visibleMethods.length > 0 ? (
            visibleMethods.map((method) => (
              <button
                className={props.selectedShippingMethodId === method.id ? pcStyles.selected : ""}
                type="button"
                onClick={() => props.onShippingMethodChange?.(method.id)}
                key={method.id}
                aria-pressed={props.selectedShippingMethodId === method.id}
              >
                <span>
                  {props.selectedShippingMethodId === method.id ? "◉" : "○"}
                  {"\u3000"}
                  {method.label}
                </span>
                <small>{method.estimate ?? "目安は未設定"}</small>
                <b>{method.pcFeeLabel ?? method.feeLabel}</b>
              </button>
            ))
          ) : (
            <p className={liveStyles.emptyCatalog}>送料一覧が未設定です。</p>
          )}
        </PcCard>
        <PcCard>
          <h3>
            配送料金（人が確認した履歴から選択）
            <button
              className={pcStyles.catalogEdit}
              type="button"
              onClick={props.onEditShippingCatalog}
            >
              料金カタログを編集
            </button>
          </h3>
          <table>
            <tbody>
              {[0, 1, 2].map((row) => (
                <tr key={row}>
                  <td>
                    {row === 0 && props.shippingMethod ? (
                      <>
                        ◉{"\u3000"}公式確認{"\u3000"}
                        {valueOrMissing(props.officialCheckedDate)}
                        {"\u3000"}
                        {valueOrMissing(props.shippingMethod)}
                        {"\u3000"}
                        {valueOrMissing(props.pcShippingFee ?? props.shippingFee)}
                      </>
                    ) : (
                      <>○{"\u3000"}確認済みの料金履歴なし</>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={pcStyles.total}>
            この注文の配送料{"\u3000"}
            <b>{valueOrMissing(props.pcShippingFee ?? props.shippingFee)}</b>
          </p>
        </PcCard>
        <PcCard>
          <h3>発送情報</h3>
          <label>
            発送予定日 <small>（人のチェック必須）</small>
            <input
              type="date"
              value={shippingDatePart(props.shippingOccurredAt)}
              disabled={props.stage === "complete"}
              onChange={(event) =>
                props.onFieldChange?.(
                  "shippingOccurredAt",
                  withShippingDate(props.shippingOccurredAt, event.target.value),
                )
              }
            />
          </label>
          <label>
            発送日時 <small>（人のチェック必須）</small>
            <input
              type={props.stage === "complete" ? "text" : "datetime-local"}
              value={props.shippingOccurredAt ?? ""}
              readOnly={props.stage === "complete"}
              onChange={(event) => props.onFieldChange?.("shippingOccurredAt", event.target.value)}
            />
          </label>
          {props.addressControl}
        </PcCard>
      </div>
      <PcNotice>
        <b>手動入力・編集可能</b>
        <br />
        配送方法や料金カタログは設定画面から編集できます。自動で外部サービスの情報を取得することはありません。
      </PcNotice>
      <div className={pcStyles.orderFooterWarning}>
        <span>▲ 発送を確定する前に未入力の注文情報を確認</span>
        <button type="button" onClick={props.onReviewOrderInfo}>
          注文情報を確認
        </button>
      </div>
      <footer>
        <button type="button" onClick={props.onSecondary}>
          戻る
        </button>
        <PcPrimary {...props}>
          {props.stage === "complete" ? "発送を記録済み" : (props.primaryLabel ?? "発送を記録")}
        </PcPrimary>
      </footer>
    </div>
  );
}

function PcCard({
  children,
  className = "",
  onClick,
}: {
  children: ReactNode;
  className?: string | undefined;
  onClick?: (() => void) | undefined;
}) {
  return (
    <section
      className={`${pcStyles.card} ${className}`}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </section>
  );
}

function PcNotice({ children }: { children: ReactNode }) {
  return (
    <p className={pcStyles.notice}>
      ⓘ{"\u3000"}
      {children}
    </p>
  );
}

function PcPrimary({
  children,
  busy,
  primaryDisabled,
  onPrimary,
}: Pick<ShippingApprovedLiveLayoutProps, "busy" | "primaryDisabled" | "onPrimary"> & {
  children: string;
}) {
  return (
    <button
      className={pcStyles.primary}
      type="button"
      disabled={busy || primaryDisabled}
      onClick={onPrimary}
    >
      {children}
      {"\u3000"}›
    </button>
  );
}

function LiveProductLabel(props: ShippingApprovedLiveLayoutProps) {
  return (
    <div className={pcStyles.productLabel}>
      <div className={pcStyles.barcode} />
      <strong>{valueOrMissing(props.inventoryNumber)}</strong>
      <span>{valueOrMissing(props.productTitle)}</span>
      <b>数量：1</b>
    </div>
  );
}

function LiveLocationLabel(props: ShippingApprovedLiveLayoutProps) {
  return (
    <div className={pcStyles.locationLabel}>
      <strong>{valueOrMissing(props.locationCode)}</strong>
      <span>● 保管場所を確認</span>
    </div>
  );
}

function LiveShelfPhoto(props: ShippingApprovedLiveLayoutProps) {
  return (
    <div className={pcStyles.shelfPhoto}>
      {props.locationPhotoUrl ? (
        <img src={props.locationPhotoUrl} alt="棚の保管場所写真" />
      ) : (
        <div
          className={liveStyles.pcPhotoPlaceholder}
          role="img"
          aria-label="保管場所の写真は未設定"
        >
          保管場所の写真は未設定
        </div>
      )}
      <span>{valueOrMissing(props.locationCode)}</span>
      <b>保管場所</b>
    </div>
  );
}

const packingChecklistItems = [
  "商品が正しい",
  "付属品が揃っている",
  "傷や汚れはない",
  "緩衝材を使用した",
  "箱をしっかり封緘した",
  "その他（任意）",
] as const;

function PackingChecklist({
  checks,
  confirmed,
  busy,
  onChange,
}: {
  checks: readonly boolean[];
  confirmed: boolean;
  busy: boolean;
  onChange: (index: number, checked: boolean) => void;
}) {
  return (
    <div className={liveStyles.packingChecklist}>
      {packingChecklistItems.map((label, index) => (
        <label key={label}>
          <input
            type="checkbox"
            checked={confirmed || checks[index] === true}
            disabled={confirmed || busy}
            onChange={(event) => onChange(index, event.target.checked)}
          />{" "}
          {label}
        </label>
      ))}
    </div>
  );
}

function PcShippingPhoto({
  title,
  url,
  state,
  kind,
}: {
  title: string;
  url?: string | undefined;
  state?: ShippingPhotoState | undefined;
  kind: "product" | "packed";
}) {
  return (
    <div className={kind === "product" ? pcStyles.headphones : pcStyles.box} aria-label={title}>
      {url ? (
        <img src={url} alt={title} />
      ) : (
        <div className={liveStyles.pcPhotoPlaceholder} role="img" aria-label={`${title}は未撮影`}>
          {title}は未撮影
        </div>
      )}
      <span className={liveStyles.photoState}>{photoLabel(state)}</span>
    </div>
  );
}
