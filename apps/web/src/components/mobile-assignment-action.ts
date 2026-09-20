export interface MobileAssignmentActionState {
  enabled: boolean;
  detail: string;
}

export function getPutawayActionState(
  loading: boolean,
  inventoryCount: number,
  locationCount: number,
): MobileAssignmentActionState {
  if (loading) return { enabled: false, detail: "担当範囲を確認しています" };
  if (inventoryCount <= 0 && locationCount <= 0) {
    return { enabled: false, detail: "商品と保管場所の割当後に利用できます" };
  }
  if (inventoryCount <= 0) {
    return { enabled: false, detail: "格納する商品の割当が必要です" };
  }
  if (locationCount <= 0) {
    return { enabled: false, detail: "保管場所の割当が必要です" };
  }
  return { enabled: true, detail: "割当範囲・チェック値を照合" };
}

export function getShippingActionState(
  loading: boolean,
  assignmentCount: number,
): MobileAssignmentActionState {
  if (loading) return { enabled: false, detail: "担当範囲を確認しています" };
  if (assignmentCount <= 0) {
    return { enabled: false, detail: "発送の割当後に利用できます" };
  }
  return { enabled: true, detail: "割当期間中の注文だけ" };
}

export function getCaptureActionState(
  loading: boolean,
  assignmentCount: number,
  failed = false,
): MobileAssignmentActionState {
  if (loading) return { enabled: false, detail: "撮影の担当商品を確認しています" };
  if (failed) {
    return { enabled: false, detail: "担当情報を確認できません。通信後に画面を更新してください" };
  }
  if (assignmentCount <= 0) {
    return { enabled: false, detail: "撮影の担当商品が割り当てられると利用できます" };
  }
  return { enabled: true, detail: "途中保存・再測定・タグ文字候補" };
}
